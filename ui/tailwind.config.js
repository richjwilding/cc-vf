const {heroui} = require("@heroui/react");

const plugin = require('tailwindcss/plugin')
const defaultTheme = require('tailwindcss/defaultTheme')
/** @type {import('tailwindcss').Config} */
module.exports = {
 // important: true,
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {pattern: /pattern-./},
    {pattern: /bg-./,
    variants: ['hover','group-hover','active',,'focus'],    
    },
    {pattern: /text-./,
      variants: ['hover','group-hover','active','focus'],    
    },
    {pattern: /ring-cc./,
      variants: ['hover','group-hover','active'],    
    },
    {pattern: /border-cc./,
      variants: ['hover','group-hover','active'], 
    },
    {pattern: /border-slate./,
      variants: ['hover','group-hover','active'], 
    },
    {pattern: /border-amber./,
      variants: ['hover','group-hover','active'], 
    },
    {pattern: /border-rose./,
      variants: ['hover','group-hover','active'], 
    },
    {pattern: /border-fuchsia./,
      variants: ['hover','group-hover','active'], 
    },
    {pattern: /border-cyan./,
      variants: ['hover','group-hover','active'], 
    },
    {
      pattern: /shadow-gray./,
    },
    {
      pattern: /line-clamp./,
    },
  ],
  theme: {
    patterns: {
      opacities: {
          100: "1",
          80: ".80",
          60: ".60",
          40: ".40",
          20: ".20",
          10: ".10",
          5: ".05",
      },
      sizes: {
          1: "0.25rem",
          2: "0.5rem",
          4: "1rem",
          6: "1.5rem",
          8: "2rem",
          16: "4rem",
          20: "5rem",
          24: "6rem",
          32: "8rem",
      }
  },
    screens: {
      'xs': '400px',
      ...defaultTheme.screens,
      '3xl': '1600px',
      '4xl': '1800px',
      '5xl': '2000px',
      '6xl': '2400px',
      '7xl': '2800px',
    },
    extend: {
       zIndex: {
        '100': '100',
        '999': '999',
        '1000': '1000',
      },
      transitionTimingFunction: {
        // cubic-bezier for a gentle overshoot/back-out
        'out-back': 'cubic-bezier(0.42, 0, 0.63, 1.51)',
      },
      animation: {
        border: 'border 2s ease infinite',
        'ripple-color': 'rippleColor 2s ease-in-out infinite',
      },
      "keyframes": {
        border: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        rippleColor: {
          '0%, 100%': { color: 'rgb(9, 95, 216)' }, // text-gray-800
          '33%':     { color: 'rgb(199, 110, 227)' },
          '66%':     { color: 'rgb(2, 216, 13)' }  // text-blue-500
        },
        "shimmer": {
          "50%": {
            "transform": "translateX(90%)",
          },
          "100%": {
            "transform": "translateX(-90%)",
          },
        },
      },
    colors:{
      ccgreen:{
        25: '#fbfefc',
        50: '#f7fdf9',
        100: '#f3fcf6',
        200: '#d2f7e2',
        300: '#a3f0c6',
        400: '#8aecb6',
        500: '#56e497',
        600: '#00d967',
        700: '#03ab51',
        800: '#027939',
        900: '#014b24',
      },
      ccblue:{
        25: '#fafcff',
        50: '#f5f9ff',
        100: '#f5faff',
        200: '#e9f5ff',
        300: '#bbe0ff',
        400: '#a3d6ff',
        500: '#74c0ff',
        600: '#0394ff',
        700: '#0077cc',
        800: '#00538f',
        900: '#002d4d',
      },
      ccpurple:{
        25: '#fbfefc',
        50: '#fdfaff',
        100: '#faf4ff',
        200: '#f5e7ff',
        300: '#e9ceff',
        400: '#e3c1ff',
        500: '#dfb5ff',
        550: '#d8a8ff',
        600: '#c781ff',
        700: '#af4dff',
        800: '#7e00e6',
        900: '#350061',
      },
    }
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      themes:{
        light:{
          colors:{
              primary:{
                50: '#f7fdf9',
                100: '#C9FACC',
                200: '#95F6A5',
                300: '#5EE582',
                400: '#35CC6C',
                500: '#03ab51',
                600: '#029353',
                700: '#017B52',
                800: '#00634C',
                900: '#005246',
                DEFAULT: "#029353",
                foreground: "#ffffff"
              },
              secondary:{
                  50: '#daf6ff',
                  100: '#ade0ff',
                  200: '#7cc9ff',
                  300: '#4ab3ff',
                  400: '#1a9eff',
                  500: '#0084e6',
                  600: '#0067b4',
                  700: '#004982',
                  800: '#002c51',
                  900: '#001021',
                DEFAULT: "#0067b4",
                foreground: "#ffffff"
              },
              focus: "#027939"
          }
        }
      }
    }),
    require('tailwindcss-bg-patterns'),
    require('@tailwindcss/container-queries'),
    plugin(function({ addUtilities, addComponents }) {
      addUtilities({
        '.subtle-shadow-bottom_old':{
          'box-shadow': '0px 8px 12px -12px rgb(115 115 115 / 75%)'
        },
        '.subtle-shadow-bottom':{
          '--tw-shadow': '0px 8px 12px -12px rgb(115 115 115 / 75%)',
          'box-shadow': 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow);'

        },
        '.scrollbar-hide': {
          /* IE and Edge */
          '-ms-overflow-style': 'none',

          /* Firefox */
          'scrollbar-width': 'none',

          /* Safari and Chrome */
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        }
      }),
      addComponents({
        '.no-break-children': {
          '&>*': {
            'break-inside': 'avoid-column'
          },
        },
      })
    })
  ]
}
