import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import {
  capturePasswordResetTokenBeforeRouterMount
} from "./auth/passwordResetTokenVault";
import "./styles/index.css";
import "./styles/role-themes.css";
import "./styles/access-administration.css";
import "./styles/invitations.css";
import "./styles/client-responses.css";
import "./styles/estimate-delivery.css";
import "./styles/designer-design-plans.css";

capturePasswordResetTokenBeforeRouterMount();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
