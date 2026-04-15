import Valkey from 'iovalkey';

export function bindValkeyCall(
  client: Valkey
): (command: string, ...args: string[]) => Promise<unknown> {
  return (client as unknown as { call: (cmd: string, ...args: string[]) => Promise<unknown> }).call.bind(client);
}
