"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

type QrCodeProps = {
  value: string;
  className?: string;
};

export default function QrCode({ value, className = "" }: QrCodeProps) {
  const svgMarkup = useMemo(() => {
    const qr = qrcode(0, "M");

    qr.addData(value);
    qr.make();

    return qr.createSvgTag(6, 3);
  }, [value]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}
