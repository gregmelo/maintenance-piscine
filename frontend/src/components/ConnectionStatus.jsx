import { Wifi, WifiOff } from "lucide-react";

export default function ConnectionStatus({ isOnline }) {
  return (
    <div className={`connection-status ${isOnline ? "is-online" : "is-offline"}`}>
      {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
      {isOnline ? "Connecté" : "Hors-ligne"}
    </div>
  );
}