export default function UpdateBanner({ onUpdate }) {
  return (
    <div className="update-banner">
      <span>Une nouvelle version est disponible !</span>
      <button onClick={onUpdate}>Mettre à jour</button>
    </div>
  );
}