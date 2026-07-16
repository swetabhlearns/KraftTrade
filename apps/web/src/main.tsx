import React from "react";
import ReactDOM from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { Toaster } from "react-hot-toast";
import { App } from "./App";
import "./styles.css";

const appId = import.meta.env.VITE_PRIVY_APP_ID || "demo-app";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><PrivyProvider appId={appId} config={{ loginMethods: ["email", "google"], appearance: { theme: "dark", accentColor: "#c6ff4a", logo: undefined }, embeddedWallets: { ethereum: { createOnLogin: "off" } } }}><App/><Toaster position="bottom-right" toastOptions={{ style: { background: "#20231c", color: "#f2f2e9", border: "1px solid #34382e" } }}/></PrivyProvider></React.StrictMode>
);
