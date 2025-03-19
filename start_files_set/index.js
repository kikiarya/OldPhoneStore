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
window.onload = function() {
    // Initialize character list
    characterList = [];
    getJsonObject('data.json',
        function(data) {
            characterList = data;
            console.log(characterList);
            console.log(characterList[0]);
            // here you can call methods to load or refresh the page 
            // loadCharacters() or refreshPage()
            books.push(...data);
            displayBooks(books);
        },
        function(xhr) { console.error(xhr); }
    );

    //to ensure cartquantity not disappear when refresh the page
    const savedCartQuantity = localStorage.getItem('cartquantity');

    if (savedCartQuantity) {
        document.getElementById("cartquantity").textContent = `(${savedCartQuantity})`;
    }

    //switch between darkmode and light mode
    const savedTheme = localStorage.getItem('theme');
    const button = document.querySelector("#darkModeToggle button");

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        button.textContent = "Light Mode";
    } else {
        button.textContent = "Dark Mode";
    }

};


function getStars(rating) {
    const numRating = parseInt(rating, 10); // Ensure it is a number
    const fullStars = '<img src = "images/star-16.ico" alt="★" width ="6">'.repeat(numRating); // Filled stars
    const emptyStars = '<img src = "images/outline-star-16.ico" alt = "☆" width = "6">'.repeat(5 - numRating); // Remaining empty stars
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

    //ensure only one checkbox would be selected at a time
    var checkboxes = document.querySelectorAll('input[name="add-to-cart"]');
    for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].addEventListener("click", function() {
            for (var j = 0; j < checkboxes.length; j++) {
                if (checkboxes[j] !== this) {
                    checkboxes[j].checked = false;
                }
            }
        });
    }
}

let currentbooks = books;

// Combine search and filter
function updateDisplay() {
    const searchTerm = document.getElementById("search-input").value.trim().toLowerCase();
    const category = document.getElementById("category-filter").value.toLowerCase();

    // 1. Filter books based on category
    let filteredBooks = books;

    if (category === "not-available") {
        filteredBooks = books.filter(function(book) {
            return !book.available; // Filter books where available is false
        });
    } else if (category === "all") {
        filteredBooks = books; // Show all books
    } else {
        filteredBooks = books.filter(function(book) {
            return book.category.toLowerCase() === category; // Filter by category
        });

        if (filteredBooks.length === 0) {
            alert("No matching books found for the selected category.");
        }
    }

    // 2. Search books by title (considering title as string even if it is a number)
    if (searchTerm) {
        filteredBooks = filteredBooks.filter(function(book) {
            return book.title.toString().toLowerCase().includes(searchTerm); // Search by title
        });
    }

    // For combined search and filter
    currentbooks = filteredBooks;
    displayBooks(currentbooks);

    // Apply search highlighting
    applySearchHighlight(searchTerm);


}

// Search button click event: only highlight search results without changing the list
function SearchBooks() {
    const searchTerm = document.getElementById("search-input").value.toLowerCase();

    // Boundary test for empty or invalid search term
    if (!searchTerm || searchTerm === " ") {
        alert("Please enter a valid term.");
        return;
    }

    applySearchHighlight(searchTerm); // Only apply search highlighting
}

// Filter books function (filter only)
function filterBooks() {
    updateDisplay(); // Update display after filtering
}

// Apply search highlighting based on search term
function applySearchHighlight(searchTerm) {
    if (!searchTerm) {
        return;
    }

    // Change color of highlight based on dark mode
    let highlightColor;
    const isDarkMode = document.body.classList.contains('dark-mode'); // Check if it is dark mode
    if (isDarkMode) {
        highlightColor = "blue";
    } else {
        highlightColor = "pink";
    }

    // If matched, highlight row
    const rows = document.querySelectorAll("#book-table tbody tr");
    let hasMatch = false;

    rows.forEach(function(row) {
        const title = row.cells[2].textContent.trim().toLowerCase(); // Third column (book title)
        if (title.includes(searchTerm)) {
            row.style.backgroundColor = highlightColor; // Apply background color for matched rows
            hasMatch = true;
        } else {
            row.style.backgroundColor = ""; // Clear background color for non-matched rows
        }
    });

    if (!hasMatch) {
        alert("No matching books found for your search term.");
    }
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
    localStorage.setItem('cartquantity', total);
}

// Confirm before resetting the cart
function resetCart() {
    if (confirm("Are you sure you want to reset the cart?")) {
        cart = [];
        updateCartTotal();
        localStorage.removeItem('cart');
    } else {
        alert("the action was canceled");
    }
}

// Toggle dark mode by adding or removing the "dark-mode" class from the body
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const button = document.querySelector("#darkModeToggle button");

    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        button.textContent = "Light Mode";
    } else {
        localStorage.setItem('theme', 'light');
        button.textContent = "Dark Mode";
    }
}
