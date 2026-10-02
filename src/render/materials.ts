/**
 * Shaders. Colours are authored gamma-encoded (sRGB) and written out
 * unchanged, so what the colour scale module computes is what appears on
 * screen.
 */
import { AdditiveBlending, Color, DataTexture, LinearFilter, NormalBlending, RGBAFormat, ShaderMaterial, UnsignedByteType } from 'three';
import { saturationColor } from '../color/saturation';

/** 256×1 lookup texture of the active saturation colour scale. */
export function saturationTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array(256 * 4), 256, 1, RGBAFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  fillSaturationTexture(tex);
  return tex;
}

/** Rewrite the lookup texture from the active colour scale. */
export function fillSaturationTexture(tex: DataTexture): void {
  const data = tex.image.data as Uint8Array;
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = saturationColor(i / 255);
    data.set([r * 255, g * 255, b * 255, 255], i * 4);
  }
  tex.needsUpdate = true;
}

const glassVertex = /* glsl */ `
  attribute vec3 color;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const glassFragment = /* glsl */ `
  uniform vec3 tint;
  uniform float useVertexColor;
  uniform float alphaCenter;
  uniform float alphaEdge;
  uniform float rimBoost;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float fres = pow(1.0 - facing, 2.0);
    vec3 base = mix(tint, vColor, useVertexColor);
    vec3 col = base * (0.55 + 0.6 * fres) + rimBoost * fres * vec3(1.0);
    gl_FragColor = vec4(col, mix(alphaCenter, alphaEdge, fres));
  }
`;

export interface GlassOptions {
  tint?: string;
  vertexColors?: boolean;
  alphaCenter: number;
  alphaEdge: number;
  rimBoost?: number;
  additive?: boolean;
}

/** Fresnel "glass" material: see-through face-on, solid at the silhouette. */
export function glassMaterial(o: GlassOptions): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: glassVertex,
    fragmentShader: glassFragment,
    uniforms: {
      tint: { value: new Color(o.tint ?? '#ffffff') },
      useVertexColor: { value: o.vertexColors ? 1 : 0 },
      alphaCenter: { value: o.alphaCenter },
      alphaEdge: { value: o.alphaEdge },
      rimBoost: { value: o.rimBoost ?? 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: o.additive ? AdditiveBlending : NormalBlending,
  });
}

/** Round, saturation-coloured point sprites with a light rim so dark (deoxygenated) cells stay visible. */
export function cellMaterial(colormap: DataTexture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      colormap: { value: colormap },
      /** Drawn cell diameter in world units (cm). Real cells are 0.0008 cm. */
      worldSize: { value: 0.5 },
      projScale: { value: 1 },
      minPx: { value: 2.5 },
      maxPx: { value: 28 },
    },
    vertexShader: /* glsl */ `
      attribute float saturation;
      uniform float worldSize;
      uniform float projScale;
      uniform float minPx;
      uniform float maxPx;
      varying float vSat;
      void main() {
        vSat = saturation;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(worldSize * projScale / -mv.z, minPx, maxPx);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D colormap;
      varying float vSat;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        vec3 c = texture2D(colormap, vec2(clamp(vSat, 0.0, 1.0), 0.5)).rgb;
        // Biconcave hint: a slightly darker centre, light rim.
        c *= mix(0.82, 1.0, smoothstep(0.0, 0.5, d));
        c = mix(c, vec3(0.92, 0.94, 1.0), smoothstep(0.62, 1.0, d) * 0.55);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}
