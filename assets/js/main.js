import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import slicerModule from "./slicer.js";

let scene, camera, renderer, controls, printBed, light, dragControls;
let imported = [];
let layers = [];

class Config {
    // Print bed
    static PRINT_BED_SIZE = 200;
    static PRINT_BED_HEIGHT = 1;
    static GRID_SIZE = 50;
    static SMALL_GRID_SIZE = 10;
    static AXIS_SIZE = 10;
    static PRINT_BED_COLOR = 0x131313;
    static LINE_COLOR = 0x666666;
    static SMALL_LINE_COLOR = 0x555555;

    // Light
    static LIGHT_COLOR = 0xffffff;
    static LIGHT_INTENSITY = 0.3;
    static HEMISPHERE_LIGHT_COLOR = 0x444444;
    static HEMISPHERE_LIGHT_INTENSITY = 0.8;
    static LIGHT_POSITION = { x: 0, y: 100, z: 0 };

    // Model
    static MODEL_COLOR = 0xff8c00;
    static MODEL_COLOR_SELECTED = 0x00ff00;
    static CORNER_COLOR = 0xffffff;
    static EDGE_COLOR = 0xffffff;
    static EDGE_WIDTH = 1;
}

class PrintBed {
    constructor() {
        this.size = Config.PRINT_BED_SIZE;
        this.height = Config.PRINT_BED_HEIGHT;

        this.color = Config.PRINT_BED_COLOR;
        this.lineColor = Config.LINE_COLOR;
        this.smallLineColor = Config.SMALL_LINE_COLOR;

        this.gridSize = Config.GRID_SIZE;
        this.smallGridSize = Config.SMALL_GRID_SIZE;

        this.axisSize = Config.AXIS_SIZE;

        this.xAxis = null;
        this.yAxis = null;
        this.zAxis = null;

        this.bed = null;
        this.gridHelper = null;
        this.smallGridHelper = null;

        this.init();
    }

    init() {
        const geometry = new THREE.BoxGeometry(this.size, this.height, this.size);
        const material = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 1,
            metalness: 0.1
        });

        this.bed = new THREE.Mesh(geometry, material);
        this.bed.position.y = -this.height / 2;

        this.gridHelper = new THREE.GridHelper(this.size, this.size / this.gridSize, this.lineColor, this.lineColor);
        this.gridHelper.position.y = 0.01;
        this.gridHelper.material.linewidth = 2;

        this.smallGridHelper = new THREE.GridHelper(this.size, this.size / this.smallGridSize, this.smallLineColor, this.smallLineColor);
        this.smallGridHelper.position.y = 0;
        this.smallGridHelper.material.linewidth = 1;

        // X axis (red)
        const xAxisMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const xAxisGeometry = new THREE.BoxGeometry(this.axisSize, 1, 1);
        this.xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
        this.xAxis.position.set(this.axisSize / 2 - this.size / 2, 0.5, this.size / 2);

        // Y axis (green)
        const yAxisMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const yAxisGeometry = new THREE.BoxGeometry(1, 1, this.axisSize);
        this.yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
        this.yAxis.position.set(-this.size / 2, 0.5, this.size / 2 - this.axisSize / 2);

        // Z axis (blue)
        const zAxisMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });
        const zAxisGeometry = new THREE.BoxGeometry(1, this.axisSize, 1);
        this.zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
        this.zAxis.position.set(-this.size / 2, this.axisSize / 2, this.size / 2);
    }

    render() {
        scene.add(this.bed);
        scene.add(this.gridHelper);
        scene.add(this.smallGridHelper);
        scene.add(this.xAxis);
        scene.add(this.yAxis);
        scene.add(this.zAxis);
    }
}


class Light {
    constructor() {
        this.color = Config.LIGHT_COLOR;
        this.position = Config.LIGHT_POSITION;
        this.light = new THREE.DirectionalLight(Config.LIGHT_COLOR, Config.LIGHT_INTENSITY);
        this.hemisphereLight = new THREE.HemisphereLight(Config.LIGHT_COLOR, Config.HEMISPHERE_LIGHT_COLOR, Config.HEMISPHERE_LIGHT_INTENSITY);

        this.init();
    }

    init() {
        this.light.position.set(this.position.x, this.position.y, this.position.z);
        this.hemisphereLight.position.set(this.position.x, this.position.y, this.position.z);
    }

    render() {
        scene.add(this.light);
        scene.add(this.hemisphereLight);
    }
}

class Model extends THREE.Mesh {
    constructor(geometry, material, name) {
        super(geometry, material);
        this.name = name;
        this.selected = false;

        this.color = Config.MODEL_COLOR;
        this.colorSelected = Config.MODEL_COLOR_SELECTED;

        this.material = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.5,
            metalness: 0.3
        });

        this.corners = [];
        this.edges = [];
    }

    createBoundingBox() {
        const box = new THREE.Box3().setFromObject(this);
        const cornerGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const cornerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        this.corners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
        ].map(corner => {
            const cornerMesh = new THREE.Mesh(cornerGeometry, cornerMaterial);
            cornerMesh.position.copy(corner);
            scene.add(cornerMesh);
            return cornerMesh;
        });

        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

        this.edges = [
            [this.corners[0], this.corners[1]],
            [this.corners[0], this.corners[2]],
            [this.corners[0], this.corners[4]],
            [this.corners[1], this.corners[3]],
            [this.corners[1], this.corners[5]],
            [this.corners[2], this.corners[3]],
            [this.corners[2], this.corners[6]],
            [this.corners[3], this.corners[7]],
            [this.corners[4], this.corners[5]],
            [this.corners[4], this.corners[6]],
            [this.corners[5], this.corners[7]],
            [this.corners[6], this.corners[7]]
        ].map(([start, end]) => {
            const edgeGeometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
                start.position.x, start.position.y, start.position.z,
                end.position.x, end.position.y, end.position.z
            ]);
            edgeGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
            const edge = new THREE.Line(edgeGeometry, edgeMaterial);
            scene.add(edge);
            return edge;
        });
    }

    removeBoundingBox() {
        if (!this.corners.length) return;

        this.corners.forEach(corner => {
            scene.remove(corner);
            corner.geometry.dispose();
            corner.material.dispose();
        });

        this.edges.forEach(edge => {
            scene.remove(edge);
        });

        this.corners = [];
        this.edges = [];
    }

    setColor(color) {
        this.material.color.set(color);
    }

    clicked() {
        this.selected = !this.selected;
        this.boundingBox = (this.selected ? this.createBoundingBox() : this.removeBoundingBox());
        this.setColor(this.selected ? this.colorSelected : this.color);
    }

    dispose() {
        this.removeBoundingBox();
        scene.remove(this);
        this.geometry.dispose();
        this.material.dispose();
    }
}



// -------------------------------------------------------------



function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbbbbbb);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 100, 200);

    const slicerCanvas = document.getElementById("slicerCanvas");
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        canvas: slicerCanvas
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = false;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };

    printBed = new PrintBed();
    light = new Light();

    printBed.render();
    light.render();

    document.getElementById("loadSTLButton").addEventListener("change", loadSTL);
    document.getElementById("clearButton").addEventListener("click", clearAll);

    renderer.domElement.addEventListener("click", selectObject, false);
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("keydown", cameraPosition);

    animate();
}

function cameraPosition(event) {
    switch (event.key.toLowerCase()) {
        case "b": // Reset 
            controls.reset();
            camera.position.set(0, 100, 200);
            break;
        case "z": // Zoom out 
            zoomToScene();
            break;
        case "0": // Isometric view
            camera.position.set(150, 150, 150);
            break;
        case "1": // Top-down view
            camera.position.set(0, 200, 0);
            break;
        case "2": // Bottom-up view
            camera.position.set(0, 0, 250);
            break;
        case "3": // Front view
            camera.position.set(0, 100, 200);
            break;
        case "4": // Back view
            camera.position.set(0, 100, -200);
            break;
        case "5": // Left view
            camera.position.set(-200, 100, 0);
            break;
        case "6": // Right view
            camera.position.set(200, 100, 0);
            break;
        case "i": // Zoom in
            camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -10);
            break;
        case "o": // Zoom out
            camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 10);
            break;
    }
    controls.update();
}

function zoomToScene() {
    const box = new THREE.Box3().setFromObject(scene);
    if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        camera.position.set(center.x, center.y + size, center.z + size);
        controls.target.copy(center);
    }
    controls.update();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function loadSTL(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const loader = new STLLoader();
        const geometry = loader.parse(e.target.result);

        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;

        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        geometry.translate(-center.x, -center.y, -center.z);

        const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const model = new Model(geometry, material, file.name);

        model.rotation.set(-Math.PI / 2, 0, 0);
        model.position.y = -bbox.min.z;

        scene.add(model);
        imported.push(model);

        // Initialize DragControls
        if (dragControls) {
            dragControls.dispose();
        }
        dragControls = new DragControls(imported, camera, renderer.domElement);
        dragControls.addEventListener('dragstart', function (event) {
            controls.enabled = false;
        });
        dragControls.addEventListener('dragend', function (event) {
            controls.enabled = true;
        });

        // Store STL information
        storeSTLInfo(model);
    };
    reader.readAsArrayBuffer(file);
}

function storeSTLInfo(model) {
    const stlInfo = {
        name: model.name,
        position: { x: model.position.x, y: model.position.y, z: model.position.z },
        rotation: { x: THREE.MathUtils.radToDeg(model.rotation.x), y: THREE.MathUtils.radToDeg(model.rotation.y), z: THREE.MathUtils.radToDeg(model.rotation.z) },
        scale: { x: model.scale.x * 100, y: model.scale.y * 100, z: model.scale.z * 100 }
    };

    console.log("STL Info:", stlInfo);
    // Store this information for later use
}

function centerLayers(layers) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    layers.forEach(layer => {
        layer.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return layers.map(layer =>
        layer.map(p => ({ x: p.x - centerX, y: p.y - centerY }))
    );
}


function drawLayers(layers) {
    layers = centerLayers(layers)
    const vertices = [];

    layers.forEach((layer, i) => {
        const zHeight = i * 0.2;
        layer.forEach(p => {
            vertices.push(p.x, zHeight, p.y);
        });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const lines = new THREE.LineSegments(geometry, material);

    imported.push(lines);
    scene.add(lines);
}

function drawPoints(layers) {
    layers = centerLayers(layers)
    layers.forEach((layer, i) => {
        const zHeight = i * 0.2;
        const points = new THREE.BufferGeometry();
        const vertices = [];
        const color = 0xff0000;

        layer.forEach(p => {
            vertices.push(p.x, zHeight, p.y);
        });

        points.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.PointsMaterial({ color, size: 2, sizeAttenuation: false });
        const pointsMesh = new THREE.Points(points, material);

        scene.add(pointsMesh);
        imported.push(pointsMesh);
    });
}


function selectObject(event) {
    event.preventDefault();

    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(imported, true);

    if (intersects.length > 0) {
        const selectedObject = intersects[0].object;
        selectedObject.clicked();

        // Add the selected object to DragControls targets
        dragControls.transformGroup = true;
        dragControls.objects = [selectedObject];

        // Show UI for rotation and scaling
        showTransformUI(selectedObject);
    }
}


function clearScene() {
    imported.forEach(model => {
        if (model.geometry) model.geometry.dispose();
        if (model.material) model.material.dispose();
        scene.remove(model);
    });

    imported = [];

    document.getElementById("loadSTLButton").value = "";

    renderer.render(scene, camera);
}

function clearAll() {
    clearScene();
    layers = []
}


// -----------------------------------------------------------------------------


let slicer;
slicerModule().then((module) => {
    slicer = module;
    console.log("WASM loaded");
}).catch((err) => {
    console.error("Failed to load WASM:", err);
});

let stlDataPointer = null;
let stlSize = 0;

document.getElementById("loadSTLButton").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file || !slicer) return;

    const arrayBuffer = await file.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    stlSize = byteArray.length;

    if (stlDataPointer) {
        slicer._free(stlDataPointer);
    }

    stlDataPointer = slicer._malloc(stlSize);
    slicer.HEAPU8.set(byteArray, stlDataPointer);

    slicer._parseSTL(stlDataPointer, stlSize);
});

document.getElementById("sliceButton").addEventListener("click", () => {
    if (!slicer || !stlDataPointer) {
        return;
    }

    const layerHeight = 0.2;
    const totalPointsPointer = slicer._malloc(4);

    const pointsPointer = slicer._slice(layerHeight, totalPointsPointer);
    const totalPoints = slicer.HEAP32[totalPointsPointer / 4];

    let currentLayer = [];

    for (let i = 0; i < totalPoints; i++) {
        const index = (pointsPointer / 4) + i * 2;
        const x = slicer.HEAPF32[index];
        const y = slicer.HEAPF32[index + 1];

        if (x === -9999 && y === -9999) {
            layers.push(currentLayer);
            currentLayer = [];
        } else {
            currentLayer.push({ x, y });
        }
    }

    clearScene()
    drawLayers(layers)

    slicer._free(totalPointsPointer);
});

document.getElementById("drawLayersButton").addEventListener("click", () => {
    clearScene()
    if (layers) {
        drawLayers(layers)
    }
});

document.getElementById("drawPointsButton").addEventListener("click", () => {
    clearScene()
    if (layers) {
        drawPoints(layers)
    }
});

function showTransformUI(object) {
    const transformUI = document.getElementById("transformUI");
    transformUI.style.display = "block";

    document.getElementById("scaleInput").value = object.scale.x * 100;
    document.getElementById("rotationXInput").value = THREE.MathUtils.radToDeg(object.rotation.x);
    document.getElementById("rotationYInput").value = THREE.MathUtils.radToDeg(object.rotation.y);
    document.getElementById("rotationZInput").value = THREE.MathUtils.radToDeg(object.rotation.z);

    document.getElementById("scaleInput").addEventListener("input", (event) => {
        const scale = event.target.value / 100;
        object.scale.set(scale, scale, scale);
        updateSTLInfo(object);
    });

    document.getElementById("rotationXInput").addEventListener("input", (event) => {
        const rotationX = THREE.MathUtils.degToRad(event.target.value);
        object.rotation.x = rotationX;
        updateSTLInfo(object);
    });

    document.getElementById("rotationYInput").addEventListener("input", (event) => {
        const rotationY = THREE.MathUtils.degToRad(event.target.value);
        object.rotation.y = rotationY;
        updateSTLInfo(object);
    });

    document.getElementById("rotationZInput").addEventListener("input", (event) => {
        const rotationZ = THREE.MathUtils.degToRad(event.target.value);
        object.rotation.z = rotationZ;
        updateSTLInfo(object);
    });
}

function updateSTLInfo(object) {
    const stlInfo = {
        name: object.name,
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
        rotation: { x: THREE.MathUtils.radToDeg(object.rotation.x), y: THREE.MathUtils.radToDeg(object.rotation.y), z: THREE.MathUtils.radToDeg(object.rotation.z) },
        scale: { x: object.scale.x * 100, y: object.scale.y * 100, z: object.scale.z * 100 }
    };

    console.log("Updated STL Info:", stlInfo);
}

init();

