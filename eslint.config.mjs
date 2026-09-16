import next from "eslint-config-next";

// eslint-config-next 16 ships flat config directly, so it is spread rather than
// wrapped in FlatCompat the way the eslintrc-era config required.
const eslintConfig = [
    ...next,
    {
        rules: {
            "react/no-unescaped-entities": "off",
            "@next/next/no-page-custom-font": "off",
        },
    },
    {
        // TanStack Table's useReactTable() returns functions the React Compiler
        // cannot memoize, so it skips this component by design. Not a defect,
        // and there is no fix short of dropping the library.
        files: ["src/components/adx/data-table.tsx"],
        rules: { "react-hooks/incompatible-library": "off" },
    },
];

export default eslintConfig;
