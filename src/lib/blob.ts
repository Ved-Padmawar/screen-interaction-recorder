export function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, data] = dataUrl.split(',')
  const mimeType = metadata.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}
