// Ocean shader configuration — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const oceanConfig = {
  // Wave layers: each layer adds sin(x*freq + t*speed)*amp
  wave1: { freq: 0.5,  speed: 1.2,  amp: 0.60  },
  wave2: { freq: 0.7,  speed: 0.8,  amp: 0.40  },
  wave3: { freq: 0.3,  speed: 1.5,  amp: 0.30  },
  wave4: { freq: 1.5,  speed: 2.0,  amp: 0.15  },

  // Water colors (hex)
  deepColor:  '#052e7a',
  midColor:   '#0d6bb8',
  lightColor: '#40bff2',
  foamColor:  '#ebf8ff',

  // Cel (toon) shading bands
  toonSteps: 4,

  // Specular highlight
  specPower:     48,
  specThreshold: 0.35,
  specIntensity: 0.85,

  // Fresnel rim
  fresnelPower:     3.0,
  fresnelIntensity: 0.35,

  // Foam crest
  foamStart: 0.55,
  foamEnd:   1.05,
  foamMax:   0.85,

  // Distance fog
  fogNear: 35,
  fogFar:  120,
};

export default oceanConfig;
