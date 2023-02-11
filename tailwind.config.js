const plugin = require('tailwindcss/plugin')
/** @type {import('tailwindcss').Config} */
module.exports = {
 // important: true,
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  safelist: [
    {pattern: /bg-./,
    variants: ['hover','group-hover','active'],    
    },
    {pattern: /text-./,
      variants: ['hover','group-hover','active'],    
    },
    {pattern: /ring-cc./,
      variants: ['hover','group-hover','active'],    
    },
    {pattern: /border-cc./,
      variants: ['hover','group-hover','active'], 
    },
    {
      pattern: /shadow-gray./,
    },
  ],
  theme: {
    extend: {
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
  plugins: [
    plugin(function({ addUtilities }) {
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
      })
    })
  ]
}
