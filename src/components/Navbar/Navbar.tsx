"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { BugIcon } from "lucide-react";
import { Tooltipped } from "../Tooltip";
import "./Navbar.css";
// Import the new JSON file directly
import SPONSORS from "./sponsors.json";
import { gameConfig } from "@/lib/gameconfig";

const NAVBAR_LINKS = [
  {
    icon: "board",
    label: "Game",
    link: "/player",
  },
  {
    icon: "book",
    label: "Matches",
    link: "/matches",
  },
  // TODO(maps): the map builder page is currently disabled
  // (src/app/mapbuilder/mapbuilder.disabled.tsx); restore it as page.tsx before enabling.
  ...(gameConfig.maps.builderEnabled ? [{
    icon: "map",
    label: "Map Builder",
    link: "/mapbuilder",
  }] : []),
  {
    icon: "config",
    label: "Config",
    link: "/settings",
  },
];

const NAVBAR_LINKS_BOTTOM: {
  icon: React.ReactNode;
  label: string;
  link: string;
}[] = [
  // {
  //   icon: <BugIcon />,
  //   label: 'Debug',
  //   link: '/debug',
  // }
];

function Navbar() {
  const pathName = usePathname();
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  const engineVersion = process.env.NEXT_PUBLIC_ENGINE_VERSION ?? "dev";

  return (
    <div className="navbar-container">
      <img src="/logo.png" className="navbar-logo" />

      {NAVBAR_LINKS.map((item) => (
        <NavbarLink
          {...item}
          key={item.label}
          selected={item.link === pathName}
        />
      ))}

      <div className="navbar-bottom-buttons">
        {NAVBAR_LINKS_BOTTOM.map((item) => (
          <NavbarLinkBottom
            {...item}
            key={item.label}
            selected={item.link === pathName}
          />
        ))}

        <div className="navbar-sponsors">
          <div className="navbar-sponsors-logos">
            {SPONSORS.map((sponsor) => (
              // The <a> tag is gone, and the key/title moved to the img tag
              <img
                key={sponsor.name}
                src={sponsor.logoUrl}
                alt={`${sponsor.name} Logo`}
                title={sponsor.name} /* Keeps the hover tooltip with the name */
                className="navbar-sponsor-logo"
              />
            ))}
          </div>
        </div>

        <p className="navbar-bottom-version">C-{appVersion}</p>
        <p className="navbar-bottom-version">E-{engineVersion}</p>
      </div>
    </div>
  );
}

interface NavbarLinkProps {
  icon: string;
  label: string;
  link: string;
  selected: boolean;
}
function NavbarLink(props: NavbarLinkProps) {
  return (
    <Link
      href={props.link}
      className={`navbar-link ${props.selected ? "selected" : ""}`}
    >
      <img
        src={`/navbar_icons/${props.icon}.png`}
        className="navbar-link-icon"
      />
      <p className="navbar-link-label">{props.label}</p>
    </Link>
  );
}

interface NavbarLinkBottomProps {
  icon: React.ReactNode;
  label: string;
  link: string;
  selected: boolean;
}
function NavbarLinkBottom(props: NavbarLinkBottomProps) {
  return (
    <Tooltipped tooltip={props.label}>
      <Link
        href={props.link}
        className={`navbar-button ${props.selected ? "selected" : ""}`}
      >
        {props.icon}
      </Link>
    </Tooltipped>
  );
}

export default Navbar;
