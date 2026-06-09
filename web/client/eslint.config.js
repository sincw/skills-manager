import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'reference/**',
    'src-tauri/target/**',
    'src/App.tsx',
    'src/components/**',
    '!src/components/AgentIcon.tsx',
    'src/context/AppContext.tsx',
    'src/hooks/useDragWindow.ts',
    'src/hooks/useMultiSelect.ts',
    'src/views/**',
    'src/lib/error.ts',
    'src/lib/presetIcons.tsx',
    'src/lib/presetStatus.ts',
    'src/lib/skillPickerStatus.ts',
    'src/lib/skillTags.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
])
