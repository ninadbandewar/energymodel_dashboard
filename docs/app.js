const climateSelect = document.getElementById("climateSelect");
const metricSearch = document.getElementById("metricSearch");
const suggestions = document.getElementById("suggestions");

const status = document.getElementById("status");
const metricInfo = document.getElementById("metricInfo");
const chartContainer = document.getElementById("chartContainer");

let catalog = [];
let climateMetrics = [];


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

        status.textContent =
            "Could not load metric catalog.";

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

    climateMetrics = catalog
        .filter(metric =>
            metric.climate_zone === climate
        );

    metricSearch.disabled = false;

    metricSearch.placeholder =
        "Search variables...";

    metricSearch.focus();

    status.textContent =
        `${climateMetrics.length.toLocaleString()} metrics available.`;
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
            () => selectMetric(metric)
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

        drawChart(data);

        chartContainer.hidden = false;

        status.textContent =
            `${data.simulation_count.toLocaleString()} simulations plotted.`;

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


    // --------------------------------------------------------
    // BOX PLOT
    // --------------------------------------------------------

    const boxTrace = {

        type: "box",

        y: validValues.map(
            item => Number(item.value)
        ),

        name: "Distribution",

        boxpoints: false,

        hovertemplate:
            "<b>Distribution</b><br>" +
            "Value: %{y:,.2f}" +
            ` ${data.unit || ""}` +
            "<extra></extra>"
    };


    // --------------------------------------------------------
    // INDIVIDUAL LOCATIONS
    // --------------------------------------------------------

    const pointTrace = {

        type: "scatter",

        mode: "markers",

        x: validValues.map(
            () => "All simulations"
        ),

        y: validValues.map(
            item => Number(item.value)
        ),

        customdata:
            validValues.map(
                item => [
                    item.location,
                    item.state || "",
                    item.latitude_category || ""
                ]
            ),

        marker: {
            size: 7,
            opacity: 0.7
        },

        hovertemplate:
            "<b>%{customdata[0]}</b><br>" +
            "Value: %{y:,.2f}" +
            ` ${data.unit || ""}` +
            "<extra></extra>",

        name: "Locations"
    };


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

        showlegend: false,

        margin: {
            l: 80,
            r: 30,
            t: 30,
            b: 60
        },

        paper_bgcolor: "white",
        plot_bgcolor: "white"
    };


    Plotly.newPlot(
        "chart",
        [
            boxTrace,
            pointTrace
        ],
        layout,
        {
            responsive: true,
            displaylogo: false
        }
    );


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