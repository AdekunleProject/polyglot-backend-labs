/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F6F7FB',
        card: '#FFFFFF',
        manila: '#EEF0F5',
        ink: '#181B22',
        inkfaint: '#6B7280',
        rust: '#2F5FE0',
        rustdark: '#2447B3',
        steel: '#0B1330',
        steellight: '#3B5BA9',
        okgreen: '#15803D',
        warnred: '#E11D48',
      },
      fontFamily: {
        display: ['Poppins', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

