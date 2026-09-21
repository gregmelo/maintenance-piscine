import { X } from "lucide-react";

export default function PhotoLightbox({ image, onClose }) {
  if (!image) return null;

  return (
    <div className="photo-lightbox" onClick={onClose}>
      <div className="photo-lightbox__content" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} title="Fermer"><X size={24} /> Fermer</button>
        <img src={image} alt="Agrandissement" />
      </div>
    </div>
  );
}