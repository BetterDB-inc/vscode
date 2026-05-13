interface ConnectionInfo {
  host: string;
  port: number;
}

interface FormatArgs {
  connection: ConnectionInfo;
  indexName: string;
  queryString: string;
  vectorBase64: string;
}

function shq(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function formatShellCommand(args: FormatArgs): string {
  const { connection, indexName, queryString, vectorBase64 } = args;
  return [
    `printf '%s' ${shq(vectorBase64)} | base64 -d | \\`,
    `  valkey-cli -h ${connection.host} -p ${connection.port} -x \\`,
    `  FT.SEARCH ${shq(indexName)} ${shq(queryString)} DIALECT 2 PARAMS 2 vec`,
  ].join('\n');
}
