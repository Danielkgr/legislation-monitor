"use client";

import { useEffect, useRef } from "react";
import SwaggerUI from "swagger-ui-dist";

export default function DocsPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    SwaggerUI({
      url: "/openapi.json",
      domNode: ref.current,
      layout: "bottom-sheet",
      docExpansion: "list",
      filter: true,
      tryItOutEnabled: true,
      requestSnippetsEnabled: true,
      defaultModelsExpandDepth: 3,
      defaultModelExpandDepth: 3,
    });
  }, []);

  return (
    <div ref={ref} className="w-full h-screen">
      {/* Inline loading state */}
      <style>{`
        .swagger-ui .topbar { display: none }
        .swagger-ui .info { margin-bottom: 16px }
        .swagger-ui .scheme-container { padding: 12px 16px }
        body .swagger-ui { font-size: 14px }
      `}</style>
    </div>
  );
}
