window.onload = function() {
    // 初始化角色列表（可用于其他用途）
    characterList = [];
    getJsonObject('data.json',
        function(data) {
            characterList = data;
            console.log(characterList);
            console.log(characterList[0]);
            // 加载书籍数据
            loadBooks();
        },
        function(xhr) { console.error(xhr); }
    );
};

const books = [];
var cart = [];


// 使用 AJAX 异步读取 JSON 文件
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

// 从 JSON 文件中加载书籍数据
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
    const numRating = parseInt(rating, 10); // 确保是数字
    const fullStars = "★".repeat(numRating); // 填满的星星
    const emptyStars = "☆".repeat(5 - numRating); // 剩余的空星
    return fullStars + emptyStars;
}

// 将书籍数据显示到表格中
function displayBooks(bookList) {
    const tableBody = document.querySelector("#book-table tbody");
    tableBody.innerHTML = "";

    bookList.forEach(function(book) {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><input type="checkbox" name="add-to-cart" value="${book.title}"></td>
            <td><img src="${book.img}" alt="${book.title}" width="50"></td>
            <td>${book.title}</td>
            <td class = "rating">${getStars(book.rating)}</td>
            <td>${book.authors}</td>
            <td>${book.year}</td>
            <td>${book.price}</td>
            <td>${book.publisher}</td>
            <td>${book.category}</td>
        `;
        tableBody.appendChild(row);
    });
}

// 对当前显示的书籍行进行搜索高亮（搜索功能不改变显示列表）
function highlightSearch() {
    const searchTerm = document.getElementById("search-input").value.toLowerCase();
    const rows = document.querySelectorAll("#book-table tbody tr");
    rows.forEach(function(row) {
        const title = row.cells[1].textContent.toLowerCase();
        if (searchTerm !== "" && title.includes(searchTerm)) {
            row.style.backgroundColor = "yellow";
        } else {
            row.style.backgroundColor = "";
        }
    });
}

// 结合类别过滤和搜索高亮
function applyFilters() {
    let filteredBooks = books;
    const selectedCategory = document.getElementById("category-filter").value.trim().toLowerCase();
    // 当选择的类别不是“all”或默认提示时，进行过滤
    if (selectedCategory !== "all" && selectedCategory !== "category") {
        filteredBooks = filteredBooks.filter(book => book.category.toLowerCase() === selectedCategory);
    }
    displayBooks(filteredBooks);
    // 在过滤后的结果中再进行搜索高亮
    highlightSearch();
}

// 搜索按钮的点击事件：只进行搜索高亮，不改变列表
function SearchBooks() {
    highlightSearch();
}

// 过滤按钮的点击事件：按类别过滤后，再应用搜索高亮
function filterBooks() {
    applyFilters();
}

// 通过事件委托处理点击“添加到购物车”复选框的事件
document.querySelector("#book-table").addEventListener("click", function(e) {
    if (e.target.name === "add-to-cart") {
        var bookTitle = e.target.value;
        addToCart(bookTitle);
        // 添加后清除选中状态（保持书籍在列表中可见）
        e.target.checked = false;
    }
});

// 根据书籍标题找到对应的书籍，并提示用户输入数量后添加至购物车
function addToCart() {
    // 获取所有被选中的复选框
    const checkboxes = document.querySelectorAll('input[name="add-to-cart"]:checked');

    // 确保只允许选择一本书
    if (checkboxes.length === 0) {
        alert("请先选择一本书！");
        return;
    } else if (checkboxes.length > 1) {
        alert("每次只能添加一本书，请取消多选！");
        return;
    }

    // 获取用户选择的书籍
    const bookTitle = checkboxes[0].value; // 只允许选择一本
    const selectedBook = books.find(book => book.title === bookTitle);

    if (!selectedBook) {
        alert("未找到该书籍，请重试！");
        return;
    }

    // 让用户输入数量
    const quantity = prompt(`请输入《${selectedBook.title}》的数量:`);

    // 校验输入数量
    //边界情况处理：空输入；非数字；零和负数；允许重复添加
    if (quantity && !isNaN(quantity) && parseInt(quantity, 10) > 0) {
        const parsedQuantity = parseInt(quantity, 10);
        console.log(`添加 ${parsedQuantity} 本 ${selectedBook.title} 到购物车`);

        const cartItem = cart.find(item => item.title === selectedBook.title);

        if (cartItem) {
            cartItem.quantity += parsedQuantity;
        } else {
            cart.push({...selectedBook, quantity: parsedQuantity });
        }

        // 确保购物车数据已更新
        console.log("购物车数据：", cart);

        // 更新购物车数量
        updateCartTotal();

        // 取消复选框选中状态
        checkboxes[0].checked = false;
    } else {
        alert("请输入有效的数量！");
    }
}

// 更新购物车中总数量的显示
function updateCartTotal() {
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById("cartquantity").textContent = `(${total})`;
}

// 重置购物车前进行确认提示
function resetCart() {
    if (confirm("Are you sure you want to reset the cart?")) {
        cart = [];
        updateCartTotal();
    }
}

// 深色模式切换：为 body 元素添加或移除 dark-mode 类
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');

}
