import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ logger }, { REQUEST_ID_HEADER }] = await Promise.all([
    import("@/lib/logger"),
    import("@/lib/request-id"),
  ]);
  const requestIdHeader = request.headers[REQUEST_ID_HEADER.toLowerCase()];

  logger.error(
    {
      err: error,
      requestId: Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader,
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
    },
    "Unhandled server error",
  );
};
