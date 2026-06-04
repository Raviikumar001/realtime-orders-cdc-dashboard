import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return React.createElement("div", null, "Frontend scaffold ready. Phase 5 will replace this.");
}

createRoot(document.getElementById("root")).render(React.createElement(App));
