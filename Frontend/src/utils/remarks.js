/**
 * splitRemarks
 * Separates remarks into plain text and an image, whether the image is a separate attachment
 * or embedded in the text as [ATTACHMENT:data:image/...].
 */
export const splitRemarks = (remarks = '', attachment = null) => {
  const embeddedPattern = /\[ATTACHMENT:(data:image\/[^\]]+)\]/;
  let text = remarks || '';
  let image = attachment || null;

  const match = text.match(embeddedPattern);
  if (match) {
    image = image || match[1];
    text = text.replace(embeddedPattern, '').trim();
  }

  return { text, image };
};
