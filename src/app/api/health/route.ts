/** Liveness probe for load balancers and orchestrators. Deliberately checks nothing downstream. */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
