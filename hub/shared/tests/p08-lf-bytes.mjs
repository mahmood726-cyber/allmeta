// The manifest records canonical LF text, independently of checkout settings.
export const lfBytes = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
