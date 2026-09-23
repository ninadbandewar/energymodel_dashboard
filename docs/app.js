const climateSelect = document.getElementById("climateSelect");
const metricSearch = document.getElementById("metricSearch");
const suggestions = document.getElementById("suggestions");

const status = document.getElementById("status");
const metricInfo = document.getElementById("metricInfo");
const chartContainer = document.getElementById("chartContainer");

let catalog = [];
let climateMetrics = [];

// Normalize climate-zone strings for comparison so that whitespace /
// casing differences between the dropdown labels and whatever the
// parser wrote (taken straight from folder names) don't break matching.
function normalizeClimate(value) {
    return (value || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}


// ============================================================
// LOAD METRIC CATALOG
// ============================================================

async function loadCatalog() {

    try {

        const response = await fetch(
            "data/metric_catalog.json",
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        catalog = data.metrics || [];

        status.textContent =
            `${catalog.length.toLocaleString()} metrics available.`;

    } catch (error) {

        console.error(error);

        const isFileProtocol =
            window.location.protocol === "file:";

        status.textContent = isFileProtocol
            ? "Could not load metric catalog. You're opening this file " +
              "directly (file://) — browsers block fetch() for local files. " +
              "Serve this folder with a local server instead, e.g. run " +
              "'python -m http.server' in this folder and open " +
              "http://localhost:8000/."
            : `Could not load metric catalog (${error.message}). ` +
              "Check that data/metric_catalog.json exists next to index.html.";

        status.classList.add("error");
    }
}

loadCatalog();


// ============================================================
// CLIMATE ZONE
// ============================================================

climateSelect.addEventListener("change", () => {

    const climate = climateSelect.value;

    metricSearch.value = "";
    suggestions.innerHTML = "";

    chartContainer.hidden = true;
    metricInfo.hidden = true;

    if (!climate) {

        metricSearch.disabled = true;

        metricSearch.placeholder =
            "Select a climate zone first...";

        status.textContent =
            "Select a climate zone to begin.";

        return;
    }

    const normalizedClimate = normalizeClimate(climate);

    climateMetrics = catalog
        .filter(metric =>
            normalizeClimate(metric.climate_zone) === normalizedClimate
        );

    metricSearch.disabled = false;

    metricSearch.placeholder =
        "Search variables...";

    metricSearch.focus();

    if (!climateMetrics.length && catalog.length) {
        const available = [...new Set(
            catalog.map(m => m.climate_zone)
        )].join(", ");

        status.textContent =
            `No metrics found for "${climate}". Climate zones present ` +
            `in the catalog: ${available || "(none)"}.`;

        status.classList.add("error");
    } else {
        status.classList.remove("error");

        status.textContent =
            `${climateMetrics.length.toLocaleString()} metrics available.`;
    }
});


// ============================================================
// SEARCH
// ============================================================

metricSearch.addEventListener("input", () => {

    const query =
        metricSearch.value
            .trim()
            .toLowerCase();

    suggestions.innerHTML = "";

    if (!query) {
        suggestions.style.display = "none";
        return;
    }

    const matches = climateMetrics
        .filter(metric => {

            const text = [
                metric.variable_name,
                metric.display_name,
                metric.key_value,
                metric.unit,
                metric.aggregation
            ]
            .join(" ")
            .toLowerCase();

            return text.includes(query);
        })
        .slice(0, 30);

    if (!matches.length) {

        suggestions.style.display = "none";

        status.textContent =
            "No matching variables found.";

        return;
    }

    matches.forEach(metric => {

        const item =
            document.createElement("button");

        item.className = "suggestion";
        item.type = "button";

        const title =
            document.createElement("div");

        title.className =
            "suggestion-title";

        title.textContent =
            metric.variable_name;

        const details =
            document.createElement("div");

        details.className =
            "suggestion-details";

        const parts = [];

        if (metric.key_value)
            parts.push(metric.key_value);

        if (metric.unit)
            parts.push(metric.unit);

        if (
            metric.aggregation &&
            metric.aggregation !== "direct"
        ) {
            parts.push(
                metric.aggregation
            );
        }

        details.textContent =
            parts.join(" • ");

        item.appendChild(title);
        item.appendChild(details);

        item.addEventListener(
            "click",
            event => {
                event.stopPropagation();
                selectMetric(metric);
            }
        );

        suggestions.appendChild(item);
    });

    suggestions.style.display = "block";

    status.textContent =
        `${matches.length} matching variable(s).`;
});


// ============================================================
// SELECT METRIC
// ============================================================

async function selectMetric(metric) {

    metricSearch.value =
        metric.variable_name;

    suggestions.innerHTML = "";
    suggestions.style.display = "none";

    status.textContent =
        "Loading simulation results...";

    chartContainer.hidden = true;
    metricInfo.hidden = true;

    try {

        /*
         * The v3 parser stores the exact public JSON
         * filename in metric.file.
         *
         * Example:
         *
         * data/warm_humid/m_a83f91c2d1ab.json
         */

        const response =
            await fetch(
                `data/${metric.file}`,
                { cache: "no-store" }
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        showMetricInfo(data);

        chartContainer.hidden = false;

        // drawChart sets its own status message, including the
        // outlier count once it's finished computing bounds.
        drawChart(data);

    } catch (error) {

        console.error(error);

        status.textContent =
            "Could not load this metric.";

        status.classList.add("error");
    }
}


// ============================================================
// METRIC INFORMATION
// ============================================================

function showMetricInfo(data) {

    metricInfo.innerHTML = "";

    const title =
        document.createElement("h2");

    title.textContent =
        data.variable_name;

    const details =
        document.createElement("p");

    const information = [];

    if (data.key_value)
        information.push(
            `Key: ${data.key_value}`
        );

    if (data.unit)
        information.push(
            `Unit: ${data.unit}`
        );

    if (
        data.aggregation &&
        data.aggregation !== "direct"
    ) {
        information.push(
            `Aggregation: ${data.aggregation}`
        );
    }

    information.push(
        `Simulations: ${data.simulation_count}`
    );

    details.textContent =
        information.join("  |  ");

    metricInfo.appendChild(title);
    metricInfo.appendChild(details);

    metricInfo.hidden = false;
}


// ============================================================
// DRAW BOX PLOT
// ============================================================

// Linear-interpolation quantile, matching numpy/Plotly's default
// "linear" quartile method, so our outlier flags line up with where
// Plotly actually draws the box whiskers.
function quantile(sortedValues, q) {

    const pos = (sortedValues.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;

    if (sortedValues[base + 1] !== undefined) {
        return sortedValues[base] +
            rest * (sortedValues[base + 1] - sortedValues[base]);
    }

    return sortedValues[base];
}

function computeIqrBounds(numericValues) {

    const sorted =
        [...numericValues].sort((a, b) => a - b);

    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;

    return {
        lower: q1 - 1.5 * iqr,
        upper: q3 + 1.5 * iqr
    };
}

function drawChart(data) {

    const values =
        data.values || [];

    const validValues =
        values.filter(
            item =>
                Number.isFinite(
                    Number(item.value)
                )
        );

    if (!validValues.length) {

        status.textContent =
            "This metric contains no numeric values.";

        return;
    }

    const numericValues =
        validValues.map(item => Number(item.value));

    const { lower, upper } =
        computeIqrBounds(numericValues);

    const isOutlier = value =>
        value < lower || value > upper;

    const normalValues =
        validValues.filter(
            item => !isOutlier(Number(item.value))
        );

    const outlierValues =
        validValues.filter(
            item => isOutlier(Number(item.value))
        );


    // --------------------------------------------------------
    // BOX PLOT
    // --------------------------------------------------------

    const boxTrace = {

        type: "box",

        y: numericValues,

        name: "Distribution",

        boxpoints: false,

        showlegend: false,

        hovertemplate:
            "<b>Distribution</b><br>" +
            "Value: %{y:,.2f}" +
            ` ${data.unit || ""}` +
            "<extra></extra>"
    };


    // --------------------------------------------------------
    // INDIVIDUAL LOCATIONS (within 1.5×IQR of the quartiles)
    // --------------------------------------------------------

    function toPointTrace(valueSet, name, color, symbol, size) {

        return {

            type: "scatter",

            mode: "markers",

            x: valueSet.map(
                () => "All simulations"
            ),

            y: valueSet.map(
                item => Number(item.value)
            ),

            customdata:
                valueSet.map(
                    item => [
                        item.location,
                        item.state || "",
                        item.latitude_category || ""
                    ]
                ),

            marker: {
                size,
                opacity: 0.75,
                color,
                symbol
            },

            hovertemplate:
                "<b>%{customdata[0]}</b><br>" +
                "Value: %{y:,.2f}" +
                ` ${data.unit || ""}` +
                `${name === "Outliers" ? " (outlier)" : ""}` +
                "<extra></extra>",

            name
        };
    }

    const pointTrace = toPointTrace(
        normalValues,
        "Locations",
        "#3b7dd8",
        "circle",
        7
    );

    // Points beyond 1.5x the interquartile range — same rule Plotly's
    // whiskers use, drawn separately so they're visually flagged
    // rather than blending in with everything else.
    const outlierTrace = toPointTrace(
        outlierValues,
        "Outliers",
        "#d43d3d",
        "diamond",
        9
    );


    // --------------------------------------------------------
    // LAYOUT
    // --------------------------------------------------------

    const layout = {

        title: {
            text: ""
        },

        xaxis: {
            showticklabels: false,
            title: ""
        },

        yaxis: {
            title: data.unit || "Value",
            zeroline: false
        },

        showlegend: outlierValues.length > 0,

        legend: {
            orientation: "h",
            y: 1.08
        },

        margin: {
            l: 80,
            r: 30,
            t: outlierValues.length > 0 ? 50 : 30,
            b: 60
        },

        paper_bgcolor: "white",
        plot_bgcolor: "white"
    };


    Plotly.newPlot(
        "chart",
        [
            boxTrace,
            pointTrace,
            outlierTrace
        ],
        layout,
        {
            responsive: true,
            displaylogo: false
        }
    );

    status.textContent = outlierValues.length
        ? `${data.simulation_count.toLocaleString()} simulations plotted — ` +
          `${outlierValues.length} flagged as outliers (beyond 1.5×IQR).`
        : `${data.simulation_count.toLocaleString()} simulations plotted — ` +
          "no statistical outliers detected.";


    // --------------------------------------------------------
    // CLICK LOCATION
    // --------------------------------------------------------

    document
        .getElementById("chart")
        .on(
            "plotly_click",
            event => {

                const point =
                    event.points[0];

                if (
                    !point ||
                    !point.customdata
                ) {
                    return;
                }

                const location =
                    point.customdata[0];

                const value =
                    Number(point.y);

                const message =
                    `${location}: ` +
                    `${value.toLocaleString(
                        undefined,
                        {
                            maximumFractionDigits: 2
                        }
                    )} ` +
                    `${data.unit || ""}`;

                status.textContent =
                    message;
            }
        );
}


// ============================================================
// CLOSE SUGGESTIONS WHEN CLICKING OUTSIDE
// ============================================================

document.addEventListener(
    "click",
    event => {

        if (
            !event.target.closest(
                ".metric-control"
            )
        ) {
            suggestions.style.display =
                "none";
        }
    }
);