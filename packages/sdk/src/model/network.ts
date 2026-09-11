import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import ipaddr from "ipaddr.js";
import { fail } from "../errors/index.js";
export async function secureFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  allowPrivate = false,
): Promise<Response> {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    fail("ACCESS_DENIED");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) fail("ACCESS_DENIED");
  if (
    !allowPrivate &&
    addresses.some((a) => ipaddr.process(a.address).range() !== "unicast")
  )
    fail("ACCESS_DENIED", "Private or special-use target rejected");
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        const all = typeof options === "object" && options.all;
        if (all) (callback as any)(null, addresses);
        else
          (callback as any)(null, addresses[0]!.address, addresses[0]!.family);
      },
    },
  });
  try {
    const response = await undiciFetch(url, {
      ...init,
      redirect: "error",
      dispatcher,
    } as Parameters<typeof undiciFetch>[1]);
    const reader = response.body?.getReader();
    if (!reader) {
      void dispatcher.close().catch(() => {});
      return new Response(null, {
        status: response.status,
        headers: response.headers as any,
      });
    }
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const r = await reader.read();
          if (r.done) {
            controller.close();
            void dispatcher.close().catch(() => {});
          } else controller.enqueue(r.value);
        } catch (e) {
          controller.error(e);
          void dispatcher.destroy().catch(() => {});
        }
      },
      async cancel() {
        await reader.cancel();
        void dispatcher.close().catch(() => {});
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as any,
    });
  } catch (e) {
    void dispatcher.destroy().catch(() => {});
    throw e;
  }
}
