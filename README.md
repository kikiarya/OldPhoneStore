# 5347Assignment1
README
B2YBooks Online Shop
Welcome to B2YBooks Online Shop! This is an interactive book shop application that allows users to search, filter, and add books to a shopping cart. The application also supports dark mode and provides a user-friendly interface for browsing books by category.

Features
Search: Search for books by title.
Filter: Filter books by category (e.g., Art, Science History, etc.) or availability.
Cart: Add books to your cart with quantity selection and reset the cart if needed.
Dark Mode: Toggle between dark and light modes for better viewing experience.
Book Details: View detailed information about each book, including title, author, year, rating, and publisher.
How to Run the Application
Requirements
Web Browser: The application is built using HTML, CSS, and JavaScript, so any modern web browser (e.g., Chrome, Firefox, Safari) should work.
JSON File: The data.json file containing the book data needs to be in the same directory as the HTML file for the application to function correctly.
Steps to Run Locally
Download the Project Files:

Ensure that you have all project files, including index.html, index.js, index.css, and data.json, in the same directory.
Open the HTML File:

Simply open index.html in any web browser of your choice.
Interacting with the Application:

The page will load with an initial set of books and options to search, filter, and add books to your cart.
Search: Type a search term and click on the search button to filter results by title.
Filter: Select a category from the dropdown and click the filter button to narrow down the books by category.
Cart: Select a book, choose its quantity, and click the "Add to Cart" button to add it to the shopping cart.
Toggle Dark Mode:

Click the "Dark Mode" button in the header to switch between light and dark themes for better viewing comfort.
Important Notes for the Marker
AJAX Request: The book data is dynamically loaded from data.json using an AJAX request. Ensure that data.json is correctly formatted in JSON and placed in the same directory as the HTML and JavaScript files.
Boundary Test for Filters: I've included a special category filter for "Not Available" books, which filters the books based on availability. This is useful for boundary testing to check how the application handles edge cases.
Cart Limitations: The application currently allows only one book to be added to the cart at a time. The cart does not support adding multiple copies of the same book simultaneously unless updated to handle such cases.
CSS Styling: The page has been designed with a responsive layout, but further improvements may be needed for smaller screen sizes.
Known Issues
Category Filter Edge Case:
The "Not Available" category filter works by showing books that are marked as unavailable. If this category is used, ensure that your JSON data includes a correct field for availability (available).
Cart Functionality:
Currently, the cart is limited to adding only one book at a time. If you select multiple books, the cart will reset for each new addition.
Project Structure
index.html: The main HTML file containing the structure of the book shop page.
index.js: The JavaScript file responsible for the functionality, including handling AJAX, filtering, and cart operations.
index.css: The CSS file that styles the page and includes dark mode styles.
data.json: The JSON file containing the book data, which includes fields like title, rating, authors, price, etc.
Conclusion
Thank you for reviewing the B2YBooks Online Shop! This project demonstrates basic web development skills such as handling AJAX requests, dynamically updating the DOM, and providing an interactive user interface.
