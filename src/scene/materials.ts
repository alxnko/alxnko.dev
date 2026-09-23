// Every surface is unlit: lighting is baked (spec §6.3). The few live effects are tiny shaders.
import { AdditiveBlending, Color, ShaderMaterial, type Texture, Vector3 } from 'three';

const vsUv = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Baked day/night atlas cross-fade. uMix: 0 = day, 1 = night. */
export function bakedMaterial(day: Texture, night: Texture, mix: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uDay: { value: day }, uNight: { value: night }, uMix: { value: mix } },
    vertexShader: vsUv,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDay; uniform sampler2D uNight; uniform float uMix;
      varying vec2 vUv;
      void main() {
        vec3 c = mix(texture2D(uDay, vUv).rgb, texture2D(uNight, vUv).rgb, uMix);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Live screen: canvas texture plus a cheap fresnel "glass" reflection (no env map). */
export function screenMaterial(map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      map: { value: map },
      uBright: { value: 1 },
      uRefl: { value: new Color('#9aa3b5') },
      uReflAmt: { value: 0.1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uBright; uniform vec3 uRefl; uniform float uReflAmt;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 base = texture2D(map, vUv).rgb * uBright;
        float fr = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 4.0);
        // soft diagonal sheen so the glass reads as glass from off-axis
        float sheen = smoothstep(0.0, 1.0, 1.0 - abs(vUv.x - vUv.y * 0.6 - 0.25) * 2.2) * 0.25;
        // reflection only at grazing angles, so the canvas panes match the live DOM panel's black face-on
        vec3 c = base + uRefl * uReflAmt * (fr * 1.6 + sheen * fr);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** The ring light's wash on the wall: additive, radial, runtime-tinted (spec D8). */
export function glowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#00ff82') }, uIntensity: { value: 1 }, uShape: { value: 1 } },
    vertexShader: vsUv,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity; uniform float uShape; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = exp(-pow((d - 0.38) * 5.0, 2.0)) * 0.55;
        float wash = pow(max(1.0 - d, 0.0), 2.2) * 0.45;
        // uShape 0: flat backlight, soft only at the very edge
        vec2 e = min(vUv, 1.0 - vUv);
        float flat_ = smoothstep(0.0, 0.08, min(e.x, e.y));
        float a = mix(flat_, ring + wash, uShape) * uIntensity;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** Flat emissive (ring torus, LEDs). */
export function emissiveMaterial(hex: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(hex) } },
    vertexShader: vsUv,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** The window: day sky or night city, procedural (no texture). */
export function skyMaterial(mix: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMix: { value: mix },
      uDayTop: { value: new Color('#c9d3dc') },
      uDayBot: { value: new Color('#eef0ef') },
      uNightTop: { value: new Color('#05070d') },
      uNightBot: { value: new Color('#141b2b') },
      uLit: { value: new Vector3(1.0, 0.78, 0.45) },
    },
    vertexShader: vsUv,
    fragmentShader: /* glsl */ `
      uniform float uMix; uniform vec3 uDayTop, uDayBot, uNightTop, uNightBot, uLit;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 day = mix(uDayBot, uDayTop, vUv.y);
        vec3 night = mix(uNightBot, uNightTop, vUv.y);
        // distant blocks along the lower third, a few lit windows
        float skyline = 0.18 + 0.14 * hash(vec2(floor(vUv.x * 9.0), 3.0));
        float bldg = step(vUv.y, skyline);
        vec2 cell = floor(vec2(vUv.x * 60.0, vUv.y * 70.0));
        float lit = step(0.86, hash(cell)) * bldg;
        night = mix(night, vec3(0.03, 0.035, 0.05), bldg * 0.9) + uLit * lit * 0.55;
        day = mix(day, vec3(0.72, 0.74, 0.76), bldg * 0.5);
        gl_FragColor = vec4(mix(day, night, uMix), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
