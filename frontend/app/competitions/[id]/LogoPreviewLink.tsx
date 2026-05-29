"use client";

import Image from "next/image";

type LogoPreviewLinkProps = {
  src: string;
  alt: string;
  title: string;
};

export default function LogoPreviewLink({
  src,
  alt,
  title,
}: LogoPreviewLinkProps) {
  function openPreview() {
    const previewWindow = window.open("", "_blank");

    if (!previewWindow) {
      window.location.href = src;
      return;
    }

    previewWindow.document.title = title;
    previewWindow.document.body.innerHTML = "";
    previewWindow.document.body.style.margin = "0";
    previewWindow.document.body.style.background = "#0a0a0a";
    previewWindow.document.body.style.color = "#ffffff";
    previewWindow.document.body.style.fontFamily = "system-ui, sans-serif";

    const wrapper = previewWindow.document.createElement("main");
    wrapper.style.minHeight = "100vh";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.gap = "24px";
    wrapper.style.padding = "32px";

    const heading = previewWindow.document.createElement("h1");
    heading.textContent = title;
    heading.style.margin = "0";
    heading.style.fontSize = "24px";

    const image = previewWindow.document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.style.maxWidth = "100%";
    image.style.height = "auto";
    image.style.objectFit = "contain";

    wrapper.appendChild(heading);
    wrapper.appendChild(image);
    previewWindow.document.body.appendChild(wrapper);
    previewWindow.opener = null;
  }

  return (
    <button
      type="button"
      onClick={openPreview}
      title={title}
      className="relative h-full w-full flex items-center justify-center cursor-zoom-in"
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="120px"
        className="object-contain p-2"
        unoptimized
      />
    </button>
  );
}
