const { tokens } = require("./theme/tokens");

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    theme: {
        extend: {
            colors: {
                ...tokens.colors,
                primary: tokens.colors.blue,
            },
            spacing: {
                ...tokens.spacing,
            },
            borderRadius: {
                ...tokens.radius,
            },
            fontFamily: {
                sans: [tokens.typography.families.sans],
                serif: [tokens.typography.families.serif],
                inter: ["Inter"],
            }
        },
    },
    plugins: [],
};
