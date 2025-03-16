window.onload = function() {
    // Initialize character list (may be used for other purposes)
    characterList = [];
    getJsonObject('data.json',
        function(data) {
            characterList = data;
            console.log(characterList);
            console.log(characterList[0]);
            // Load book data
            loadBooks();
        },
        function(xhr) { console.error(xhr); }
    );
};

const books = [];
var cart = [];

// Use AJAX to asynchronously read a JSON file
function getJsonObject(path, success, error) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
                if (success) success(JSON.parse(xhr.responseText));
            } else {
                if (error) error(xhr);
            }
        }
    };
    xhr.open("GET", path, true);
    xhr.send();
}

// Load book data from the JSON file
function loadBooks() {
    getJsonObject('data.json',
        function(data) {
            books.push(...data);
            displayBooks(books);
        },
        function(xhr) { console.error(xhr); }
    );
}

function getStars(rating) {
    const numRating = parseInt(rating, 10); // Ensure it is a number
    const fullStars = "★".repeat(numRating); // Filled stars
    const emptyStars = "☆".repeat(5 - numRating); // Remaining empty stars
    return fullStars + emptyStars;
}

// Display book data in the table
function displayBooks(bookList) {
    const tableBody = document.querySelector("#book-table tbody");
    tableBody.innerHTML = "";

    bookList.forEach(function(book) {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><input type="checkbox" name="add-to-cart" value="${book.title}"></td>
            <td><img src="${book.img}" alt="${book.title}" width="50"></td>
            <td>${book.title}</td>
            <td class="rating">${getStars(book.rating)}</td>
            <td>${book.authors}</td>
            <td>${book.year}</td>
            <td>${book.price}</td>
            <td>${book.publisher}</td>
            <td>${book.category}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Highlight search results in the current book list (search function does not change the displayed list)
function highlightSearch() {
    const searchTerm = document.getElementById("search-input").value.toLowerCase();
    const rows = document.querySelectorAll("#book-table tbody tr");
    rows.forEach(function(row) {
        const title = row.cells[2].textContent.toLowerCase(); // Third column
        if (searchTerm !== "" && title.includes(searchTerm)) {
            row.style.backgroundColor = "pink";
        } else {
            row.style.backgroundColor = "";
        }
    });
}

// Search button click event: only highlight search results without changing the list
function SearchBooks() {
    highlightSearch();
}


// Apply category filter and highlight search results
function filterBooks() {
    const category = document.getElementById("category-filter").value.toLowerCase();
    let filteredBooks = books;

    // Filter books based on the selected category
    if (category !== "all" && category !== "category" && category !== "not-available") {
        filteredBooks = filteredBooks.filter(book => book.category.toLowerCase() === category);
    }

    // Display filtered books
    displayBooks(filteredBooks);

    // Apply search highlighting
    highlightSearch();
}

// Prevent filter button from triggering form submission
document.querySelector("#filterBox button").addEventListener("click", function(event) {
    event.preventDefault(); // Prevent form submission
    filterBooks(); // Call filter function
});

// Handle "Add to Cart" checkbox click event using event delegation
document.querySelector("#book-table").addEventListener("click", function(e) {
    if (e.target.name === "add-to-cart") {
        var bookTitle = e.target.value;
        addToCart(bookTitle);
        // Clear selection after adding (to keep books visible in the list)
        e.target.checked = false;
    }
});

// Find the selected book by title, prompt the user for quantity, and add to cart
function addToCart() {
    // Get all selected checkboxes
    const checkboxes = document.querySelectorAll('input[name="add-to-cart"]:checked');

    // Ensure only one book can be selected at a time
    if (checkboxes.length === 0) {
        alert("Please select a book first!");
        return;
    } else if (checkboxes.length > 1) {
        alert("You can only add one book at a time. Please deselect multiple choices!");
        return;
    }

    // Get the selected book title
    const bookTitle = checkboxes[0].value; // Only allow one selection
    const selectedBook = books.find(book => book.title === bookTitle);

    if (!selectedBook) {
        alert("Book not found. Please try again!");
        return;
    }

    // Prompt user to enter quantity
    const quantity = prompt(`Enter quantity for "${selectedBook.title}":`);

    // Validate quantity input
    // Edge cases: empty input, non-numeric input, zero/negative numbers, allow repeated additions
    if (quantity && !isNaN(quantity) && parseInt(quantity, 10) > 0) {
        const parsedQuantity = parseInt(quantity, 10);
        console.log(`Added ${parsedQuantity} copies of ${selectedBook.title} to the cart`);

        const cartItem = cart.find(item => item.title === selectedBook.title);

        if (cartItem) {
            cartItem.quantity += parsedQuantity;
        } else {
            cart.push({...selectedBook, quantity: parsedQuantity });
        }

        // Ensure cart data is updated
        console.log("Cart Data:", cart);

        // Update cart total quantity
        updateCartTotal();

        // Deselect checkbox after adding
        checkboxes[0].checked = false;
    } else {
        alert("Please enter a valid quantity!");
    }
}

// Update the total quantity displayed in the cart
function updateCartTotal() {
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById("cartquantity").textContent = `(${total})`;
}

// Confirm before resetting the cart
function resetCart() {
    if (confirm("Are you sure you want to reset the cart?")) {
        cart = [];
        updateCartTotal();
    }
}

// Toggle dark mode by adding or removing the "dark-mode" class from the body
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
}
