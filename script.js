const categoryButtons = document.querySelectorAll(".category-pill");
const searchableCards = document.querySelectorAll(".game-card, .mini-card");
const searchInput = document.querySelector("#searchInput");

let selectedCategory = "All";
let searchTerm = "";

function updateVisibleGames() {
  searchableCards.forEach((card) => {
    const cardCategory = card.dataset.category;
    const cardText = card.textContent.toLowerCase();
    const matchesCategory = selectedCategory === "All" || selectedCategory === cardCategory;
    const matchesSearch = cardText.includes(searchTerm);

    card.classList.toggle("is-hidden", !matchesCategory || !matchesSearch);
  });
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedCategory = button.textContent.trim();

    categoryButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    updateVisibleGames();
  });
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  updateVisibleGames();
});
