import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const sections = [
  { text: "LEXA", image: "/images/img1.png" },
  { text: "ROAR", image: "/images/img2.png" },
  { text: "SPARK", image: "/images/img3.png" },
];

const scrollWrapper = document.getElementById("gl-container");
const container = document.getElementById("gl-scroller");

let renderer, camera, scene, mesh;
let textures = [];
let currentIndex = 0;
let targetIndex = 0;
let isTransitioning = false;

const lenis = new Lenis();
lenis.on("scroll", ScrollTrigger.update);

const vertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D u_texture0;
  uniform sampler2D u_texture1;
  uniform sampler2D u_displacement;
  uniform float u_progress;
  uniform float u_strength;
  uniform float u_rgbShift;
  uniform float u_scale;
  uniform vec2 u_resolution;
  uniform vec2 u_textureResolution0;
  uniform vec2 u_textureResolution1;
  
  varying vec2 vUv;
  
  vec2 coverUV(vec2 uv, vec2 planeRes, vec2 texRes) {
    float scale = max(planeRes.x / texRes.x, planeRes.y / texRes.y);
    vec2 newSize = texRes * scale;
    return uv * (planeRes / newSize) + (newSize - planeRes) / 2.0 / newSize;
  }
  
  void main() {
    // Displacement with animated wave effect
    float disp = texture2D(u_displacement, vUv).r;
    disp = mix(disp, disp * (sin(vUv.y * 10.0 + u_progress * 6.28) * 0.5 + 0.5), 0.3);
    
    // Calculate cover UVs for both textures
    vec2 uv0 = coverUV(vUv, u_resolution, u_textureResolution0);
    vec2 uv1 = coverUV(vUv, u_resolution, u_textureResolution1);
    
    // Scale effect during transition
    float scaleEffect = 1.0 + u_progress * (1.0 - u_progress) * u_scale;
    vec2 center = vec2(0.5);
    
    // Distorted UVs with displacement
    vec2 distortedUV0 = (uv0 - center) / scaleEffect + center + u_progress * disp * u_strength * vec2(1.0, 0.5);
    vec2 distortedUV1 = (uv1 - center) * scaleEffect + center - (1.0 - u_progress) * disp * u_strength * vec2(1.0, 0.5);
    
    // RGB shift effect
    float rgbOffset = u_progress * (1.0 - u_progress) * u_rgbShift;
    
    // Sample textures with RGB shift
    vec4 tex0 = vec4(
      texture2D(u_texture0, distortedUV0 + vec2(rgbOffset, 0.0)).r,
      texture2D(u_texture0, distortedUV0).g,
      texture2D(u_texture0, distortedUV0 - vec2(rgbOffset, 0.0)).b,
      texture2D(u_texture0, distortedUV0).a
    );
    
    vec4 tex1 = vec4(
      texture2D(u_texture1, distortedUV1 + vec2(rgbOffset, 0.0)).r,
      texture2D(u_texture1, distortedUV1).g,
      texture2D(u_texture1, distortedUV1 - vec2(rgbOffset, 0.0)).b,
      texture2D(u_texture1, distortedUV1).a
    );
    
    // Blend textures
    gl_FragColor = mix(tex0, tex1, smoothstep(0.0, 1.0, u_progress));
  }
`;

function loadTexture(url) {
  return new Promise((resolve, reject) => 
    {
    new THREE.TextureLoader().load(url, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      resolve(texture);
    },
      undefined,
      reject,
    );
  });
}

function setTextureResolution(material, index, texture) {
  if (texture.image?.width) {
    material.uniforms[`u_textureResolution${index}`].value.set(
      texture.image.width,
      texture.image.height,
    );
  }
}

function transitionTo(index) {
  if (
    index < 0 ||
    index >= textures.length ||
    index === currentIndex ||
    isTransitioning
  ) {
    targetIndex = index;
    return;
  }

  targetIndex = index;
  isTransitioning = true;

  const material = mesh.material;
  material.uniforms.u_texture1.value = textures[index];
  setTextureResolution(material, 1, textures[index]);

  gsap.to(material.uniforms.u_progress, {
    value: 1,
    duration: 0.8,
    ease: "power3.inOut",
    onComplete: () => {
      material.uniforms.u_texture0.value = textures[index];
      setTextureResolution(material, 0, textures[index]);
      material.uniforms.u_progress.value = 0;
      currentIndex = index;
      isTransitioning = false;

      if (targetIndex !== currentIndex) {
        transitionTo(targetIndex);
      }
    },
  });
}

async function init() {
  const overlay = document.createElement("div");
  overlay.classList.add("gl");

  sections.forEach(({ text }) => {
    const inner = document.createElement("div");
    inner.classList.add("gl-inner");
    inner.innerHTML = `<p>${text}</p>`;
    overlay.appendChild(inner);
  });

  scrollWrapper.appendChild(overlay);
  scrollWrapper.style.height = `${sections.length * 100}vh`;

  const { clientWidth: width, clientHeight: height } = container;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  camera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    -1,
    1,
  );

  scene = new THREE.Scene();

  const geometry = new THREE.PlaneGeometry(width, height);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      u_texture0: { value: null },
      u_texture1: { value: null },
      u_displacement: { value: null },
      u_progress: { value: 0 },
      u_resolution: { value: new THREE.Vector2(width, height) },
      u_textureResolution0: { value: new THREE.Vector2(1, 1) },
      u_textureResolution1: { value: new THREE.Vector2(1, 1) },
      u_strength: { value: 0.8 },
      u_rgbShift: { value: 0.05 },
      u_scale: { value: 0.15 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  try {
    const [loadedTextures, displacement] = await Promise.all([
      Promise.all(sections.map((section) => loadTexture(section.image))),
      loadTexture("/15.jpg"),
    ]);

    textures = loadedTextures;
    const mat = mesh.material;

    mat.uniforms.u_texture0.value = textures[0];
    mat.uniforms.u_texture1.value = textures[0];
    mat.uniforms.u_displacement.value = displacement;
    setTextureResolution(mat, 0, textures[0]);
    setTextureResolution(mat, 1, textures[0]);

    ScrollTrigger.create({
      trigger: scrollWrapper,
      start: "top top",
      end: `+=${(textures.length - 1) * 100}%`,
      scrub: true,
      onUpdate: (self) => {
        const newIndex = Math.round(self.progress * (textures.length - 1));
        transitionTo(newIndex);
      },
    });
  } catch (err) {
    console.error("Error initializing GL:", err);
  }
}

function render(time) {
  lenis.raf(time);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function onResize() {
  const { clientWidth: width, clientHeight: height } = container;
  renderer.setSize(width, height);

  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();

  mesh.geometry.dispose();
  mesh.geometry = new THREE.PlaneGeometry(width, height);
  mesh.material.uniforms.u_resolution.value.set(width, height);

  ScrollTrigger.update();
}

init();
requestAnimationFrame(render);
window.addEventListener("resize", onResize);
