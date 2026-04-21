declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

// Injected at build time by webpack DefinePlugin (see webpack.config.js)
declare const __API_BASE_URL__: string;
declare const __INSTALL_LOG_API_KEY__: string;
