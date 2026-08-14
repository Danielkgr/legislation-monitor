declare module "swagger-ui-dist" {
  interface SwaggerUIOptions {
    url?: string;
    domNode: HTMLElement;
    spec?: Record<string, unknown>;
    layout?: string;
    docExpansion?: string;
    filter?: boolean;
    tryItOutEnabled?: boolean;
    requestSnippetsEnabled?: boolean;
    defaultModelsExpandDepth?: number;
    defaultModelExpandDepth?: number;
  }

  function SwaggerUI(options: SwaggerUIOptions): void;
  export default SwaggerUI;
}
