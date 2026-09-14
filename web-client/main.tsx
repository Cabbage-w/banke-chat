import React from "react";
import {createRoot} from "react-dom/client";
import ChatApp from "../app/chat-app";
import "../app/globals.css";
createRoot(document.getElementById("root")!).render(<ChatApp signedIn={false}/>);
