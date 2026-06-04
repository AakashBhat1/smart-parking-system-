/**
 * Smart Parking System — Three.js 3D Parking Lot Visualizer
 * Renders 3D parking spaces, generates low-poly cars, and animates parking transitions.
 */
(function() {
    let scene, camera, renderer, controls;
    let container;
    let slotObjects = {}; // space_id -> THREE.Group (the slot outline)
    let carObjects = {};  // space_id -> THREE.Group (the car mesh)
    let slotData = {};    // space_id -> data object
    let isInitialized = false;
    let floor1SlabMesh, floor1GridHelper;
    let floor2SlabMesh, floor2GridHelper;
    let gridHelper;
    let cameraTargetPos = null, controlsTargetPos = null;
    let transitionStartTime = 0;
    const transitionDuration = 1000; // ms transition time
    let currentFocusedFloor = 'all';

    const slotWidth = 4.8;
    const slotDepth = 2.6;
    const slotHeight = 0.1;
    
    // Map zones to coordinates
    // Row layouts: Zone A (Z=-12), Zone B (Z=0), Zone C (Z=12)
    const zoneZCoords = { 'A': -12, 'B': 0, 'C': 12 };
    const xSpacing = 6.5;

    window.initParking3D = function() {
        if (isInitialized) return;
        
        container = document.getElementById('threejs-container');
        if (!container) return;

        isInitialized = true;
        
        // 1. Setup Scene & Camera
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0a);
        scene.fog = new THREE.FogExp2(0x0a0a0a, 0.015);

        const width = container.clientWidth;
        const height = container.clientHeight;
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 35, 45); // Elevated angled view

        // 2. Setup Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // 3. Setup Controls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.1; // Don't allow camera under floor
        controls.minDistance = 15;
        controls.maxDistance = 100;
        controls.target.set(0, 0, 0);

        // 4. Setup Lighting
        const ambientLight = new THREE.AmbientLight(0x222233, 1.5);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0x00c853, 0.6); // Emerald directional tint
        dirLight.position.set(30, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.bias = -0.001;
        scene.add(dirLight);

        // Spotlights for cool neon look
        const spot1 = new THREE.SpotLight(0x00c853, 5, 40, Math.PI/4, 0.5, 1);
        spot1.position.set(-20, 20, -20);
        scene.add(spot1);

        const spot2 = new THREE.SpotLight(0x00b0ff, 4, 40, Math.PI/4, 0.5, 1); // Blue accent spot
        spot2.position.set(20, 20, 20);
        scene.add(spot2);

        // 5. Ground Floor
        const floorGeo = new THREE.PlaneGeometry(120, 80);
        const floorMat = new THREE.MeshStandardMaterial({ 
            color: 0x111115, 
            roughness: 0.85, 
            metalness: 0.1 
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        // Add asphalt grid lines
        gridHelper = new THREE.GridHelper(120, 24, 0x222222, 0x181818);
        gridHelper.position.y = 0.01;
        gridHelper.material = gridHelper.material.clone();
        scene.add(gridHelper);

        // Add Floor 1 Slab and Grid
        const slabGeo = new THREE.BoxGeometry(70, 0.2, 40);
        const slab1Mat = new THREE.MeshStandardMaterial({ 
            color: 0x13131b, 
            roughness: 0.85, 
            metalness: 0.2,
            transparent: true,
            opacity: 0.9
        });
        floor1SlabMesh = new THREE.Mesh(slabGeo, slab1Mat);
        floor1SlabMesh.position.set(0, 7.5 - 0.1, 0);
        floor1SlabMesh.receiveShadow = true;
        scene.add(floor1SlabMesh);

        floor1GridHelper = new THREE.GridHelper(70, 14, 0x333344, 0x1f1f2e);
        floor1GridHelper.position.set(0, 7.5, 0);
        floor1GridHelper.material = floor1GridHelper.material.clone();
        scene.add(floor1GridHelper);

        // Add Floor 2 Slab and Grid
        const slab2Mat = new THREE.MeshStandardMaterial({ 
            color: 0x13131b, 
            roughness: 0.85, 
            metalness: 0.2,
            transparent: true,
            opacity: 0.9
        });
        floor2SlabMesh = new THREE.Mesh(slabGeo, slab2Mat);
        floor2SlabMesh.position.set(0, 15 - 0.1, 0);
        floor2SlabMesh.receiveShadow = true;
        scene.add(floor2SlabMesh);

        floor2GridHelper = new THREE.GridHelper(70, 14, 0x333344, 0x1f1f2e);
        floor2GridHelper.position.set(0, 15, 0);
        floor2GridHelper.material = floor2GridHelper.material.clone();
        scene.add(floor2GridHelper);

        // Add Support Pillars
        const pillarGeo = new THREE.CylinderGeometry(0.4, 0.4, 15, 8);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x22222b, roughness: 0.5, metalness: 0.8 });
        const pillarPositions = [
            [-32, 7.5, -18],
            [32, 7.5, -18],
            [-32, 7.5, 18],
            [32, 7.5, 18]
        ];
        pillarPositions.forEach(pos => {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(pos[0], pos[1], pos[2]);
            scene.add(pillar);
        });

        // Add road markings (yellow/white lines)
        drawRoadMarkings();

        // 6. Build Parking Spaces from live DB
        fetchAndCreateSpaces();

        // 7. Raycasting & Clicks
        setupRaycasting();

        // 8. Event listeners
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('sandbox:entry', (e) => handleSandboxEvent(e.detail, 'entry'));
        window.addEventListener('sandbox:exit', (e) => handleSandboxEvent(e.detail, 'exit'));

        // Initialize Floor Selector Click Events
        setupFloorSelector();

        // Start Animation Loop
        animate();
        
        // Start Polling data updates
        setInterval(pollSpacesData, 3000);
    };

    function drawRoadMarkings() {
        // Draw center division lines
        const lineGeo = new THREE.BoxGeometry(100, 0.02, 0.2);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        
        const roadLine1 = new THREE.Mesh(lineGeo, lineMat);
        roadLine1.position.set(0, 0.02, -6);
        scene.add(roadLine1);
        
        const roadLine2 = new THREE.Mesh(lineGeo, lineMat);
        roadLine2.position.set(0, 0.02, 6);
        scene.add(roadLine2);
    }

    // Procedurally generate a stylish low-poly car
    const carColors = [0xffd54f, 0x29b6f6, 0xab47bc, 0xff7043, 0x26a69a, 0xec407a, 0x78909c, 0xeeeeee];
    function createCar(plateText) {
        // Pick a color deterministically based on license plate string hash
        let hash = 0;
        if (plateText) {
            for (let i = 0; i < plateText.length; i++) {
                hash = plateText.charCodeAt(i) + ((hash << 5) - hash);
            }
        }
        const colorIndex = Math.abs(hash) % carColors.length;
        const carColor = carColors[colorIndex];

        const carGroup = new THREE.Group();

        // Chassis/Body
        const bodyGeo = new THREE.BoxGeometry(3.6, 0.65, 1.8);
        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: carColor, 
            roughness: 0.2, 
            metalness: 0.8 
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.5;
        body.castShadow = true;
        body.receiveShadow = true;
        carGroup.add(body);

        // Cabin
        const cabinGeo = new THREE.BoxGeometry(1.8, 0.6, 1.5);
        const cabinMat = new THREE.MeshStandardMaterial({ 
            color: 0x080808, 
            roughness: 0.1, 
            metalness: 0.9,
            transparent: true,
            opacity: 0.85
        });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(-0.2, 1.1, 0);
        cabin.castShadow = true;
        carGroup.add(cabin);

        // Wheels (Cylinder)
        const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        
        const wheelPositions = [
            [-1.1, 0.38, 0.95],
            [1.1, 0.38, 0.95],
            [-1.1, 0.38, -0.95],
            [1.1, 0.38, -0.95]
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(pos[0], pos[1], pos[2]);
            wheel.rotation.x = Math.PI / 2;
            wheel.castShadow = true;
            carGroup.add(wheel);
        });

        // Headlights
        const lightGeo = new THREE.BoxGeometry(0.1, 0.15, 0.25);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff9c4 });
        
        const hlRight = new THREE.Mesh(lightGeo, lightMat);
        hlRight.position.set(1.8, 0.65, 0.6);
        const hlLeft = new THREE.Mesh(lightGeo, lightMat);
        hlLeft.position.set(1.8, 0.65, -0.6);
        
        carGroup.add(hlRight);
        carGroup.add(hlLeft);

        // Rear lights
        const rLightMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
        const rlRight = new THREE.Mesh(lightGeo, rLightMat);
        rlRight.position.set(-1.8, 0.65, 0.6);
        const rlLeft = new THREE.Mesh(lightGeo, rLightMat);
        rlLeft.position.set(-1.8, 0.65, -0.6);

        carGroup.add(rlRight);
        carGroup.add(rlLeft);

        // Store plate info inside group
        carGroup.userData = { plate: plateText };
        return carGroup;
    }

    function parseSpaceId(spaceId) {
        const match = spaceId.match(/-(\d+)$/);
        const idNum = match ? parseInt(match[1]) : 1;
        let floor = 'G';
        if (spaceId.startsWith('F1-')) {
            floor = '1';
        } else if (spaceId.startsWith('F2-')) {
            floor = '2';
        }
        return { idNum, floor };
    }

    function getZoneFromSpaceId(spaceId) {
        const match = spaceId.match(/-(\d+)$/);
        if (!match) return 'A';
        const num = parseInt(match[1]);
        if (num <= 3) return 'A';
        if (num <= 6) return 'B';
        return 'C';
    }

    function calculateSlotCoords(spaceId, zone) {
        const { idNum, floor } = parseSpaceId(spaceId);
        const zoneZ = zoneZCoords[zone] || 0;
        
        // Arrange 8 spaces per row horizontally, centered
        const idxInZone = (idNum - 1) % 8; 
        const xOffset = -22.75 + idxInZone * xSpacing;
        
        let yOffset = 0;
        if (floor === '1') yOffset = 7.5;
        else if (floor === '2') yOffset = 15;
        
        return { x: xOffset, y: yOffset, z: zoneZ };
    }

    function fetchAndCreateSpaces() {
        fetch('/api/spaces')
            .then(r => r.json())
            .then(data => {
                data.spaces.forEach(s => {
                    slotData[s.space_id] = s;
                    const coords = calculateSlotCoords(s.space_id, s.zone);

                    // 1. Create Outline Box representing parking space
                    const outlineGroup = new THREE.Group();
                    outlineGroup.position.set(coords.x, coords.y, coords.z);
                    outlineGroup.userData = { spaceId: s.space_id };

                    // Drawing boundary lines
                    const w = slotWidth;
                    const d = slotDepth;
                    const lineMat = new THREE.LineBasicMaterial({ 
                        color: s.is_occupied ? 0xff5252 : 0x00c853,
                        linewidth: 2 
                    });

                    const points = [
                        new THREE.Vector3(-w/2, 0.02, -d/2),
                        new THREE.Vector3(w/2, 0.02, -d/2),
                        new THREE.Vector3(w/2, 0.02, d/2),
                        new THREE.Vector3(-w/2, 0.02, d/2),
                        new THREE.Vector3(-w/2, 0.02, -d/2)
                    ];
                    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                    const outline = new THREE.Line(lineGeo, lineMat);
                    outlineGroup.add(outline);

                    // Transparent filler box to make clicking easier
                    const fillGeo = new THREE.BoxGeometry(w, 0.2, d);
                    const fillMat = new THREE.MeshBasicMaterial({ 
                        color: s.is_occupied ? 0xff5252 : 0x00c853,
                        transparent: true,
                        opacity: 0.02
                    });
                    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
                    fillMesh.position.y = 0.1;
                    outlineGroup.add(fillMesh);

                    scene.add(outlineGroup);
                    slotObjects[s.space_id] = outlineGroup;

                    // 2. Put a car if occupied
                    if (s.is_occupied) {
                        const car = createCar(s.plate_text);
                        car.position.set(coords.x, coords.y, coords.z);
                        // Rotate car to face "outwards" or "inwards" based on zone row
                        car.rotation.y = s.zone === 'C' ? 0 : Math.PI;
                        scene.add(car);
                        carObjects[s.space_id] = car;
                    }
                });
                updateFloorVisibilities();
            })
            .catch(() => {});
    }

    // Periodically sync the 3D visualizer with the database
    function pollSpacesData() {
        fetch('/api/spaces')
            .then(r => r.json())
            .then(data => {
                data.spaces.forEach(s => {
                    const old = slotData[s.space_id];
                    slotData[s.space_id] = s;
                    
                    if (!old) return;

                    // Check for occupancy changes
                    if (old.is_occupied !== s.is_occupied) {
                        if (s.is_occupied) {
                            animateCarParking(s.space_id, s.plate_text, s.zone);
                        } else {
                            animateCarLeaving(s.space_id);
                        }
                    }
                });
            })
            .catch(() => {});
    }

    // Entrance gate animation coords
    const entranceGate = { x: -55, y: 0, z: 0 };
    const exitGate = { x: 55, y: 0, z: 0 };

    function animateCarParking(spaceId, plateText, zone) {
        // Destroy existing car object if any
        if (carObjects[spaceId]) {
            scene.remove(carObjects[spaceId]);
        }

        // Update outline color to red
        updateSlotOutlineColor(spaceId, 0xff5252);

        const coords = calculateSlotCoords(spaceId, zone);
        const car = createCar(plateText);
        
        // Spawn car at gate
        car.position.set(entranceGate.x, entranceGate.y, entranceGate.z);
        car.rotation.y = Math.PI / 2; // Facing right
        scene.add(car);
        carObjects[spaceId] = car;

        const duration = 2200; // ms
        const startTime = performance.now();
        const targetY = coords.y;

        function driveIn(now) {
            const progress = (now - startTime) / duration;
            if (progress >= 1) {
                car.position.set(coords.x, coords.y, coords.z);
                car.rotation.set(0, zone === 'C' ? 0 : Math.PI, 0);
                updateFloorVisibilities();
                return;
            }

            if (targetY > 0) {
                // Multi-floor ramp path
                if (progress < 0.2) {
                    const t = progress / 0.2;
                    car.position.x = entranceGate.x + (-35 - entranceGate.x) * t;
                    car.position.y = 0;
                    car.position.z = 0;
                    car.rotation.set(0, Math.PI / 2, 0);
                } else if (progress < 0.55) {
                    const t = (progress - 0.2) / 0.35;
                    car.position.x = -35 + (-20 - (-35)) * t;
                    car.position.y = targetY * t;
                    car.position.z = 0;
                    car.rotation.set(0, Math.PI / 2, -0.25); // Pitch up
                } else if (progress < 0.8) {
                    const t = (progress - 0.55) / 0.25;
                    car.position.x = -20 + (coords.x - (-20)) * t;
                    car.position.y = targetY;
                    car.position.z = 0;
                    car.rotation.set(0, coords.x > -20 ? Math.PI / 2 : -Math.PI / 2, 0);
                } else {
                    const t = (progress - 0.8) / 0.2;
                    car.position.x = coords.x;
                    car.position.y = targetY;
                    car.position.z = coords.z * t;
                    
                    const targetRot = zone === 'C' ? 0 : Math.PI;
                    const startRot = coords.x > -20 ? Math.PI / 2 : -Math.PI / 2;
                    car.rotation.set(0, startRot + (targetRot - startRot) * t, 0);
                }
            } else {
                // Ground floor path
                if (progress < 0.5) {
                    const t = progress / 0.5;
                    car.position.x = entranceGate.x + (coords.x - entranceGate.x) * t;
                    car.position.y = 0;
                    car.position.z = 0;
                    car.rotation.set(0, coords.x > entranceGate.x ? Math.PI / 2 : -Math.PI / 2, 0);
                } else {
                    const t = (progress - 0.5) / 0.5;
                    car.position.x = coords.x;
                    car.position.y = 0;
                    car.position.z = coords.z * t;
                    const targetRot = zone === 'C' ? 0 : Math.PI;
                    const startRot = coords.x > entranceGate.x ? Math.PI / 2 : -Math.PI / 2;
                    car.rotation.set(0, startRot + (targetRot - startRot) * t, 0);
                }
            }

            // Sync opacity
            const { floor: carFloor } = parseSpaceId(spaceId);
            const isFocused = (currentFocusedFloor === 'all' || carFloor === currentFocusedFloor);
            setGroupOpacity(car, isFocused ? 1.0 : 0.15);

            requestAnimationFrame(driveIn);
        }
        requestAnimationFrame(driveIn);
    }

    function animateCarLeaving(spaceId) {
        const car = carObjects[spaceId];
        if (!car) {
            updateSlotOutlineColor(spaceId, 0x00c853);
            return;
        }

        delete carObjects[spaceId];
        updateSlotOutlineColor(spaceId, 0x00c853);

        const startX = car.position.x;
        const startZ = car.position.z;
        const startY = car.position.y;
        const duration = 2000;
        const startTime = performance.now();

        function driveOut(now) {
            const progress = (now - startTime) / duration;
            if (progress >= 1) {
                scene.remove(car);
                return;
            }

            if (startY > 0) {
                // Multi-floor ramp path leaving
                if (progress < 0.2) {
                    const t = progress / 0.2;
                    car.position.x = startX;
                    car.position.y = startY;
                    car.position.z = startZ * (1 - t);
                    car.rotation.set(0, startZ > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
                } else if (progress < 0.45) {
                    const t = (progress - 0.2) / 0.25;
                    car.position.x = startX + (20 - startX) * t;
                    car.position.y = startY;
                    car.position.z = 0;
                    car.rotation.set(0, Math.PI / 2, 0);
                } else if (progress < 0.8) {
                    const t = (progress - 0.45) / 0.35;
                    car.position.x = 20 + (35 - 20) * t;
                    car.position.y = startY * (1 - t);
                    car.position.z = 0;
                    car.rotation.set(0, Math.PI / 2, 0.25); // Pitch down
                } else {
                    const t = (progress - 0.8) / 0.2;
                    car.position.x = 35 + (exitGate.x - 35) * t;
                    car.position.y = 0;
                    car.position.z = 0;
                    car.rotation.set(0, Math.PI / 2, 0);
                }
            } else {
                // Ground floor path
                if (progress < 0.4) {
                    const t = progress / 0.4;
                    car.position.x = startX;
                    car.position.y = 0;
                    car.position.z = startZ * (1 - t);
                    car.rotation.set(0, startZ > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
                } else {
                    const t = (progress - 0.4) / 0.6;
                    car.position.x = startX + (exitGate.x - startX) * t;
                    car.position.y = 0;
                    car.position.z = 0;
                    car.rotation.set(0, Math.PI / 2, 0);
                }
            }

            // Sync opacity
            const { floor: carFloor } = parseSpaceId(spaceId);
            const isFocused = (currentFocusedFloor === 'all' || carFloor === currentFocusedFloor);
            setGroupOpacity(car, isFocused ? 1.0 : 0.15);

            requestAnimationFrame(driveOut);
        }
        requestAnimationFrame(driveOut);
    }

    function updateSlotOutlineColor(spaceId, hexColor) {
        const slot = slotObjects[spaceId];
        if (!slot) return;
        
        slot.traverse(child => {
            if (child instanceof THREE.Line) {
                child.material.color.setHex(hexColor);
            }
        });
    }

    function handleSandboxEvent(detail, type) {
        if (!isInitialized) return;
        
        if (type === 'entry') {
            slotData[detail.space_id] = {
                space_id: detail.space_id,
                is_occupied: 1,
                plate_text: detail.plate_text,
                zone: getZoneFromSpaceId(detail.space_id),
                floor: parseSpaceId(detail.space_id).floor
            };
            animateCarParking(detail.space_id, detail.plate_text, slotData[detail.space_id].zone);
        } else if (type === 'exit') {
            if (slotData[detail.space_id]) {
                slotData[detail.space_id].is_occupied = 0;
                slotData[detail.space_id].plate_text = null;
            }
            animateCarLeaving(detail.space_id);
        }
    }

    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();

    function setupRaycasting() {
        const canvas = renderer.domElement;
        const tooltip = document.getElementById('three-tooltip');

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);

            const intersects = raycaster.intersectObjects(scene.children, true);
            
            let clickedSlotId = null;
            for (let hit of intersects) {
                let obj = hit.object;
                while (obj.parent) {
                    if (obj.userData && obj.userData.spaceId) {
                        clickedSlotId = obj.userData.spaceId;
                        break;
                    }
                    obj = obj.parent;
                }
                if (clickedSlotId) break;
            }

            if (clickedSlotId) {
                const s = slotData[clickedSlotId];
                if (!s) return;

                const statusText = s.is_occupied ? 'Occupied' : 'Free';
                const plateText = s.plate_text || '--';
                const actionBtn = s.is_occupied 
                    ? `<button class="tooltip-action" onclick="release3DSpace('${s.space_id}')"><i class="fas fa-xmark"></i> Release Spot</button>` 
                    : '';

                tooltip.innerHTML = `
                    <div class="tooltip-header">Space: ${s.space_id}</div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Floor:</span>
                        <span class="tooltip-value">${s.floor === 'G' ? 'Ground' : 'Floor ' + s.floor}</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Status:</span>
                        <span class="tooltip-value" style="color: ${s.is_occupied ? '#ff5252' : '#00c853'}">${statusText}</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Plate:</span>
                        <span class="tooltip-value">${plateText}</span>
                    </div>
                    ${actionBtn}
                `;

                tooltip.style.left = `${e.clientX - rect.left + 15}px`;
                tooltip.style.top = `${e.clientY - rect.top - 80}px`;
                tooltip.classList.add('active');
            } else {
                tooltip.classList.remove('active');
            }
        });
    }

    window.release3DSpace = function(spaceId) {
        if (!confirm(`Release space ${spaceId}?`)) return;
        
        fetch(`/api/spaces/${spaceId}/release`, { method: 'POST' })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    animateCarLeaving(spaceId);
                    if (slotData[spaceId]) {
                        slotData[spaceId].is_occupied = 0;
                        slotData[spaceId].plate_text = null;
                    }
                    
                    document.getElementById('three-tooltip').classList.remove('active');
                    
                    // Dispatch exit event with full billing data
                    window.dispatchEvent(new CustomEvent('sandbox:exit', { detail: data }));
                }
            })
            .catch(() => alert('Failed to release space'));
    };

    function setupFloorSelector() {
        const buttons = document.querySelectorAll('.floor-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                buttons.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'none';
                    b.style.color = 'var(--text-2)';
                    b.style.border = '1px solid transparent';
                });
                
                btn.classList.add('active');
                btn.style.background = 'var(--accent)';
                btn.style.color = '#000';
                btn.style.border = 'none';
                
                const floor = btn.getAttribute('data-floor');
                focusOnFloor(floor);
            });
        });
    }

    function focusOnFloor(floor) {
        currentFocusedFloor = floor;
        
        if (floor === 'all') {
            transitionCamera(new THREE.Vector3(0, 35, 45), new THREE.Vector3(0, 5, 0));
        } else if (floor === 'G') {
            transitionCamera(new THREE.Vector3(0, 15, 30), new THREE.Vector3(0, 0, 0));
        } else if (floor === '1') {
            transitionCamera(new THREE.Vector3(0, 7.5 + 15, 30), new THREE.Vector3(0, 7.5, 0));
        } else if (floor === '2') {
            transitionCamera(new THREE.Vector3(0, 15 + 15, 30), new THREE.Vector3(0, 15, 0));
        }

        updateFloorVisibilities();
    }

    function updateFloorVisibilities() {
        const floor = currentFocusedFloor;
        
        Object.entries(slotObjects).forEach(([spaceId, group]) => {
            const { floor: slotFloor } = parseSpaceId(spaceId);
            const isFocused = (floor === 'all' || slotFloor === floor);
            setGroupOpacity(group, isFocused ? 1.0 : 0.15);
        });

        Object.entries(carObjects).forEach(([spaceId, group]) => {
            const { floor: carFloor } = parseSpaceId(spaceId);
            const isFocused = (floor === 'all' || carFloor === floor);
            setGroupOpacity(group, isFocused ? 1.0 : 0.15);
        });

        if (floor1SlabMesh && floor1GridHelper) {
            const isFocused = (floor === 'all' || floor === '1');
            floor1SlabMesh.material.opacity = isFocused ? 0.9 : 0.15;
            floor1GridHelper.material.opacity = isFocused ? 1.0 : 0.15;
            floor1GridHelper.material.transparent = true;
        }
        if (floor2SlabMesh && floor2GridHelper) {
            const isFocused = (floor === 'all' || floor === '2');
            floor2SlabMesh.material.opacity = isFocused ? 0.9 : 0.15;
            floor2GridHelper.material.opacity = isFocused ? 1.0 : 0.15;
            floor2GridHelper.material.transparent = true;
        }
        if (gridHelper) {
            const isFocused = (floor === 'all' || floor === 'G');
            gridHelper.material.opacity = isFocused ? 1.0 : 0.15;
            gridHelper.material.transparent = true;
        }
    }

    function setGroupOpacity(object, opacity) {
        object.traverse(child => {
            if (child.isMesh || child.isLine) {
                child.material.transparent = true;
                if (child.userData.originalOpacity === undefined) {
                    child.userData.originalOpacity = child.material.opacity;
                }
                child.material.opacity = opacity * (child.userData.originalOpacity !== undefined ? child.userData.originalOpacity : 1.0);
            }
        });
    }

    function transitionCamera(targetCamPos, targetLookAt) {
        cameraTargetPos = targetCamPos.clone();
        controlsTargetPos = targetLookAt.clone();
        transitionStartTime = performance.now();
    }

    function onWindowResize() {
        if (!isInitialized) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    function animate() {
        requestAnimationFrame(animate);
        
        const now = performance.now();
        if (cameraTargetPos && controlsTargetPos && (now - transitionStartTime < transitionDuration)) {
            camera.position.lerp(cameraTargetPos, 0.08);
            controls.target.lerp(controlsTargetPos, 0.08);
        } else {
            cameraTargetPos = null;
            controlsTargetPos = null;
        }

        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    }
})();
