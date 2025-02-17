import { Scraper } from 'agent-twitter-client';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

export type FetchParameters = [input: RequestInfo | URL, init?: RequestInit];
export interface FetchTransformOptions {
  /**
   * Transforms the request options before a request is made. This executes after all of the default
   * parameters have been configured, and is stateless. It is safe to return new request options
   * objects.
   * @param args The request options.
   * @returns The transformed request options.
   */
  request: (
    ...args: FetchParameters
  ) => FetchParameters | Promise<FetchParameters>;
  /**
   * Transforms the response after a request completes. This executes immediately after the request
   * completes, and is stateless. It is safe to return a new response object.
   * @param response The response object.
   * @returns The transformed response object.
   */
  response: (response: Response) => Response | Promise<Response>;
}

export interface ScraperOptions {
  /**
   * An alternative fetch function to use instead of the default fetch function. This may be useful
   * in nonstandard runtime environments, such as edge workers.
   */
  fetch: typeof fetch;
  /**
   * Additional options that control how requests and responses are processed. This can be used to
   * proxy requests through other hosts, for example.
   */
  transform: Partial<FetchTransformOptions>;
}

export class CustomScraper extends Scraper {
  constructor(
    options?: Partial<ScraperOptions> | undefined,
    proxyUrl?: string,
  ) {
    super({
      fetch: async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        let agent = undefined;
        if (proxyUrl) {
          agent = new HttpsProxyAgent(proxyUrl);
        }
        const response = await axios.request({
          url: input.toString(),
          method: init?.method || 'GET',
          headers: init?.headers
            ? Object.fromEntries(init.headers as any)
            : undefined,
          data: init?.body,
          httpsAgent: agent,
        });
        return new Response(response.data, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers as Record<string, string>),
        });
      },
      // using options
      transform: options?.transform,
    });
  }
}
