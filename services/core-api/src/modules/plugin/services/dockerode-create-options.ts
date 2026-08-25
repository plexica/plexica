import type Docker from 'dockerode';

/**
 * Splits a container create request into docker-modem's explicit wire shape.
 *
 * docker-modem echoes the full options object into BOTH the query string and
 * the JSON body of POST /containers/create (`buildQuerystring(opts)` and
 * `JSON.stringify(opts)`), which the CI Docker control proxy rejects: it
 * admits exactly one query parameter (`name`) and an allow-listed body.
 * Passing `_query` (consumed for the querystring) and `_body` (the forwarded
 * document) keeps real Dockerode clients on that strict contract.
 */
export function dockerodeCreateOptions(
  name: string,
  payload: Omit<Docker.ContainerCreateOptions, 'name'>
): Docker.ContainerCreateOptions {
  return {
    _query: { name },
    _body: payload,
  } as unknown as Docker.ContainerCreateOptions;
}
