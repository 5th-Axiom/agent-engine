/** Add release artifacts here when the product delivery form is decided. */
export const deliveryForms = [
  {
    id: "source",
    label: "源码",
    status: "available",
    href: "/docs/integration/",
  },
  {
    id: "sdk",
    label: "SDK 开发包（本地 .tgz）",
    status: "available",
    href: "/docs/installation/#按接入路线选包",
  },
  { id: "npm", label: "公共 npm", status: "undecided" },
  { id: "cli", label: "CLI", status: "undecided" },
  { id: "archive", label: "压缩包", status: "undecided" },
  { id: "installer", label: "安装包", status: "undecided" },
] as const;
