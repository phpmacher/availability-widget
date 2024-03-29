javascript: (function () {
    if (window.document.location.host.replace("www.", "") != "decathlon.de") {
        return;
    }

    var oDiv = document.createElement("div");
    var oSpan = document.createElement("p");

    oDiv.setAttribute("class", "topbar");
    oDiv.setAttribute("style", "color:#000000; text-align:center;");

    models = __DKT._ctx.data[4].data.models;

    var text = "";
    models.forEach(function (model) {
        text += model.webLabel + "<br>";

        if (model.colors) {
            model.colors.forEach(function (color) {
                text += color.label + ", ";
            });
            text += "<br>";
        }

        shortTitle = model.webLabel.split(" ")[0];
        model.skus.forEach(function (sku) {
            text += "" + sku.size + ": " + sku.skuId + ", " + shortTitle;

            text += "<br>";
        });
        text += "<br>";
    });

    oSpan.innerHTML = text;

    document.body.insertBefore(oDiv, document.body.firstChild);
    oDiv.appendChild(oSpan);

    window.scrollTo(0, 0);
})();
