interface ImportMeta { readonly env: { readonly DEV: boolean } }
/** True in dev (`vite` serve) and in a build made with `VITE_KART_PACK=1`: the kart fan pack is installed (see main.ts). Set by `define` in the Vite configs. */
declare const __KART_PACK__: boolean;
