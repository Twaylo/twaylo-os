import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copie de MapLibre, reconstruite avant chaque build depuis node_modules.
    // C'est du code tiers minifié : l'analyser ne dit rien d'utile sur ce
    // projet, et noie les vrais avertissements sous des milliers de lignes.
    "public/piraterie/vendeur/**",
  ]),
]);

export default eslintConfig;
