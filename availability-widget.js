// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: bicycle;

/*
    Copyright (C) 2022  phpmacher

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

    ********************************************
    *                                          *
    *       Availability-Widget                *
    *                                          *
    *       v1.0.0 - made by @phpmacher        *
    *       https://twitter.com/phpmacher      *
    *                                          *
    ********************************************
    
    Feel free to contact me on Twitter or
    GitHub, if you have any questions or issues.

    GitHub Repo:
    https://github.com/phpmacher/availability-widget
    
*/

/////////////////////////////////////////
//
//  Your configuration:
//
/////////////////////////////////////////

// How many minutes should the cache be valid before refresh
// Hint: keep this value NOT to short, to respect the server-load of the online-shops.
//       I would suggest at least 60 minutes.
const CACHEMINUTES = 60;

// How many minutes should the cache be valid, if there is no internet-connection
// 1440 = 1 day
const LONGCACHEMINUTES = 1440;

// your own description or name of watched default-product (used when called from within scriptable)
var productName = "Wanderhose";

// sku-id of watched default-product (used when called from within scriptable)
var skuId = 2558501;

// Hint: You can configure each widget individually with a seperate product to watch:
//       {"product":"Merinoshirt","sku":2559785}

/////////////////////////////////////////
//
//  Do not edit below this line!
//
/////////////////////////////////////////

const widgetVersion = 1;
const widgetTitle = "Decathlon";

var DEBUG = false;
const log = function () {
    if (DEBUG) {
        console.log.apply(console, arguments);
    }
};

/////////////////////////////////////////
//
//  "cache" class
//
/////////////////////////////////////////

class Cache {
    constructor(name, expirationMinutes) {
        // Determine if the user is using iCloud.
        this.fm = FileManager.local();
        this.iCloudInUse = this.fm.isFileStoredIniCloud(module.filename);

        // If so, use an iCloud file manager.
        this.fm = this.iCloudInUse ? FileManager.iCloud() : this.fm;

        this.cachePath = this.fm.joinPath(
            this.fm.documentsDirectory(),
            name.trim() + "Cache"
        );
        this.expirationMinutes = expirationMinutes;

        // create cache-directory
        if (!this.fm.fileExists(this.cachePath)) {
            this.fm.createDirectory(this.cachePath);
        }
    }

    async read(key, expirationMinutes) {
        try {
            const path = this.fm.joinPath(this.cachePath, key);

            if (this.iCloudInUse) {
                await this.fm.downloadFileFromiCloud(path);
            }
            let createdAt = this.fm.creationDate(path);

            if (expirationMinutes || this.expirationMinutes) {
                let diff = new Date() - createdAt;
                if (
                    diff >
                    (expirationMinutes || this.expirationMinutes) * 60000
                ) {
                    log("cache is invalid!");
                    return null;
                }
            }

            const value = this.fm.readString(path);

            try {
                return JSON.parse(value);
            } catch (error) {
                return value;
            }
        } catch (error) {
            return null;
        }
    }

    async delete(key) {
        try {
            const path = this.fm.joinPath(this.cachePath, key);
            if (this.iCloudInUse) {
                await this.fm.downloadFileFromiCloud(path);
            }

            // Delete backup file
            let backupFilename = path.replace(".json", ".bak");
            log("delete backup file... " + backupFilename);
            try {
                this.fm.remove(backupFilename);
            } catch (error) {
                log("delete: backup file not found... " + backupFilename);
            }

            // Backup datafile
            log("backup datafile... " + path);
            this.fm.copy(path, backupFilename);

            // Delete datafile
            log("delete datafile... ");
            this.fm.remove(path);
        } catch (error) {
            log("Error on delete... error=" + error);
            //return null;
        }
    }

    write(key, value) {
        const path = this.fm.joinPath(this.cachePath, key.replace("/", "-"));
        log(`Caching to ${path}...`);

        if (typeof value === "string" || value instanceof String) {
            this.fm.writeString(path, value);
        } else {
            this.fm.writeString(path, JSON.stringify(value));
        }
    }

    async getModifiedDate(skuId, productName) {
        let key = createCacheFilename(skuId, productName);

        try {
            const path = this.fm.joinPath(this.cachePath, key);
            if (this.iCloudInUse) {
                await this.fm.downloadFileFromiCloud(path);
            }
            return this.fm.creationDate(path);
        } catch (error) {
            log("Cache date not found... " + JSON.stringify(error));
            return new Date();
        }
    }
}

/////////////////////////////////////////
//
//  Data-Functions
//
/////////////////////////////////////////

async function fetchData(
    { url, headers, cache, cacheKey, cacheExpiration },
    sku
) {
    // return cached version, if not expired
    if (cache && cacheKey) {
        const cached = await cache.read(cacheKey, cacheExpiration);
        if (cached) {
            return cached;
        }
    }

    // cache is expired or does not exist
    try {
        // Fetching url
        const req = new Request(url);
        if (headers) {
            req.headers = headers;
        }

        // parse received data
        const jsonResponse = await req.loadJSON();

        if (cache && cacheKey) {
            // delete old cachedata
            log("delete old cachedata..." + cacheKey);
            try {
                await cache.delete(cacheKey);
            } catch (error) {
                log("Error on delete-cache... " + error);
            }

            // Writing new cache
            log("Writing new cache...");
            cache.write(cacheKey, jsonResponse);

            // get live stockdata from json
            log("get live stockdata...");
            const newValue = getValueFromJSON(jsonResponse, sku);

            // get backup stockdata from backup cachefile
            log("get backup...");
            const oldValue = await getBackup(sku);

            log("newValue=" + newValue);
            log("oldValue=" + oldValue);

            // New value is bigger than backup value
            if (oldValue >= 0 && newValue >= 0 && newValue > oldValue) {
                // send notification
                let notify1 = new Notification();
                notify1.title = "Neue Lieferung";
                notify1.body = "Es gibt jetzt wieder mehr von: " + productName;
                await notify1.schedule();
            }
        }
        return jsonResponse;
    } catch (error) {
        // error fallback
        if (cache && cacheKey) {
            try {
                // Get long-cache...
                log("Get long-cache...");
                return cache.read(cacheKey, LONGCACHEMINUTES);
            } catch (error) {
                // Couldn't get long-cache...
                log(error);
            }
        } else {
            log(`Couldn't fetch ${url}`);
            log(error);
        }
    }
}

async function getBackup(sku) {
    // Execute the request and parse the response as json
    const response = await fetchBackup({
        cache,
        cacheKey: createCacheFilename(sku, productName).replace(
            ".json",
            ".bak"
        ),
    });

    // Return the found stock data
    return getValueFromJSON(response, sku);
}

async function fetchBackup({ cache, cacheKey }) {
    if (cache && cacheKey) {
        try {
            return cache.read(cacheKey, LONGCACHEMINUTES);
        } catch (error) {
            log(`Couldn't get backup-cache... ` + cacheKey);
            log(error);
            return null;
        }
    } else {
        log(`Couldn't fetch backup`);
        log(error);
        return null;
    }
}

function createCacheFilename(skuId, productName) {
    return (
        `product_${skuId}_${productName}`
            .replace(/[\W_]+/g, " ")
            .trim()
            .replace(/[\W_]+/g, "-") + ".json"
    );
}

function getValueFromJSON(launchData, skuString) {
    try {
        // Parse stock availability from json
        const value = launchData[skuString].stockOnline;
        return value;
    } catch (error) {
        return -1;
    }
}

async function getData(sku) {
    const cachebuster = "&cb=" + Math.round(new Date().getTime() / 1000);

    // Query url
    const url =
        "https://www.decathlon.de/de/ajax/nfs/stocks/online?skuIds=" +
        sku +
        cachebuster;

    // Execute the request and parse the response as json
    const response = await fetchData(
        {
            url,
            cache,
            cacheKey: createCacheFilename(sku, productName),
        },
        sku
    );

    // Return the found stock data
    return getValueFromJSON(response, sku);
}

/////////////////////////////////////////
//
//  Scriptable
//
/////////////////////////////////////////

const cache = new Cache(widgetTitle, CACHEMINUTES);

// parse widget-parameters
if (args.widgetParameter != null) {
    let widgetConfig = args.widgetParameter.split(",");

    skuId = "" + widgetConfig[0].trim() || "123456";
    productName = widgetConfig[1] ? widgetConfig[1].trim() : "";
}

let widget = await createWidget(productName, "" + skuId);

// Check WHERE the script is running
if (config.runsInWidget) {
    // Runs inside a widget so add it to the homescreen widget
    Script.setWidget(widget);
} else if (config.runsWithSiri) {
    Speech.speak("Du solltest das in einem Widget anzeigen.");
} else {
    // Show the small widget inside the app
    widget.presentSmall();
}

Script.complete();

async function createWidget(productName, skuId) {
    // Create new empty ListWidget instance
    let listwidget = new ListWidget();

    // set widget url when widget is clicked
    listwidget.url = "https://www.decathlon.de/search?Ntt=" + skuId;

    // Fetch availability of configured product
    let stockValue = await getData(skuId);

    // Set new background color
    listwidget.backgroundColor = new Color("#000000");

    let firstLineStack = listwidget.addStack();

    let provider = firstLineStack.addText(widgetTitle);
    provider.font = Font.mediumSystemFont(12);
    provider.textColor = new Color("#EDEDED");

    // Last Update
    firstLineStack.addSpacer();
    let modified = await cache.getModifiedDate(skuId, productName);

    // german format: yyyy-MM-dd HH:mm
    let readableDateFormatter = new DateFormatter();
    readableDateFormatter.dateFormat = "HH:mm";

    let readableDateString = readableDateFormatter.string(modified);
    let lastUpdateText = firstLineStack.addText(readableDateString);

    lastUpdateText.font = Font.systemFont(12);
    lastUpdateText.rightAlignText();
    lastUpdateText.textColor = Color.lightGray();

    listwidget.addSpacer();

    // Add widget heading
    let heading = listwidget.addText(productName);
    heading.centerAlignText();
    heading.font = Font.lightSystemFont(25);
    heading.textColor = new Color("#ffffff");

    // Spacer between heading and availability
    //listwidget.addSpacer();

    // Add availability-data to the widget
    setWidget(listwidget, stockValue);

    listwidget.addSpacer();

    // Return the created widget
    return listwidget;
}

function setWidget(stack, stockValue) {
    // Check if availability is set
    if (stockValue > 0) {
        // Add stock data to display
        writeData2Widget(stack, "" + stockValue + " " + "Stück", 1);
    } else if (stockValue == 0) {
        // Add stock data to display
        writeData2Widget(stack, "Nicht lieferbar!", -1);
    } else {
        writeData2Widget(stack, "No data found", -1);
    }
}

function writeData2Widget(stack, text, style) {
    let dateText = stack.addText(text);
    dateText.centerAlignText();

    switch (style) {
        case 0:
            // nothing in stock
            dateText.font = Font.semiboldSystemFont(20);
            dateText.textColor = new Color("#cccccc");
            break;

        case 1:
            // product available
            dateText.font = Font.semiboldSystemFont(22);
            dateText.textColor = new Color("#00ff00");
            break;

        default:
            // no data found: possible wrong sku or service is down
            dateText.font = Font.semiboldSystemFont(22);
            dateText.textColor = new Color("#ff0000");
            break;
    }
}

/////////////////////////////////////////
//
//  Changelog
//
/////////////////////////////////////////
