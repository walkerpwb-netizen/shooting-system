"use client";

import { useEffect } from "react";

import { apiUrl } from "@/lib/api";

type UiSettings = {
  block_padding: string;
  block_min_height: string;
  block_radius: string;
  button_padding_x: string;
  button_padding_y: string;
  button_min_height: string;
  button_radius: string;
  navbar_padding_x: string;
  navbar_padding_y: string;
  navbar_content_max_width: string;
};

const cssVariableNames: Record<keyof UiSettings, string> = {
  block_padding: "--ss-block-padding",
  block_min_height: "--ss-block-min-height",
  block_radius: "--ss-block-radius",
  button_padding_x: "--ss-button-padding-x",
  button_padding_y: "--ss-button-padding-y",
  button_min_height: "--ss-button-min-height",
  button_radius: "--ss-button-radius",
  navbar_padding_x: "--ss-navbar-padding-x",
  navbar_padding_y: "--ss-navbar-padding-y",
  navbar_content_max_width: "--ss-navbar-content-max-width",
};

export default function GlobalUiSettings() {
  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const response = await fetch(
          apiUrl("/settings/ui"),
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const settings: Partial<UiSettings> = await response.json();

        if (!active) {
          return;
        }

        Object.entries(cssVariableNames).forEach(([key, variableName]) => {
          const value = settings[key as keyof UiSettings];

          if (value) {
            document.documentElement.style.setProperty(variableName, value);
          }
        });
      } catch (error) {
        console.error(error);
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
