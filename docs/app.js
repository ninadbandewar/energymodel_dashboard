const DATA_ROOT = "data/";

const climateFolders = {

    "Cold":
        "Cold",

    "Composite":
        "Composite",

    "Temperate":
        "Temperate",

    "Hot & Dry":
        "Hot_Dry",

    "Warm & Humid":
        "Warm_Humid"
};


let metricCatalog = [];

let selectedMetric = null;


// ============================================================
// ELEMENTS
// ============================================================

const climateSelect =
    document.getElementById("climate");

const searchInput =
    document.getElementById("metricSearch");

const metricResults =
    document.getElementById("metricResults");

const selectedMetricPanel =
    document.getElementById("selectedMetric");

const metricTitle =
    document.getElementById("metricTitle");

const metricUnit =
    document.getElementById("metricUnit");

const simulationCount =
    document.getElementById("simulationCount");

const valueCount =
    document.getElementById("valueCount");

const message =
    document.getElementById("message");


// ============================================================
// LOAD METRIC CATALOG
// ============================================================

async function loadCatalog() {

    try {

        const response =
            await fetch(
                DATA_ROOT +
                "metric_catalog.json"
            );

        if (!response.ok) {

            throw new Error(
                "Could not load metric catalog."
            );
        }

        metricCatalog =
            await response.json();

    } catch (error) {

        message.textContent =
            "Could not load dashboard data.";

        console.error(error);
    }
}


// ============================================================
// SEARCH METRICS
// ============================================================

function searchMetrics() {

    const query =
        searchInput.value
            .trim()
            .toLowerCase();


    if (!query) {

        metricResults.innerHTML = "";

        return;
    }


    const climate =
        climateSelect.value;


    const matches =
        metricCatalog
            .filter(metric => {

                const climateMatch =
                    metric.source_table ===
                    "ReportData"
                    ? true
                    : true;

                const text =
                    (
                        metric.variable_name
                        + " "
                        + metric.key_value
                        + " "
                        + metric.display_unit
                    ).toLowerCase();


                return (
                    text.includes(query)
                    &&
                    (
                        !metric.climate_zones
                        ||
                        metric.climate_zones.includes(
                            climate
                        )
                    )
                );

            })
            .slice(0, 50);


    metricResults.innerHTML = "";


    matches.forEach(metric => {

        const item =
            document.createElement("div");

        item.className =
            "metric-result";


        const name =
            document.createElement("div");

        name.className =
            "metric-name";

        name.textContent =
            metric.variable_name;


        const unit =
            document.createElement("div");

        unit.className =
            "metric-unit";

        let unitText =
            metric.display_unit || "No unit";


        if (
            metric.key_value
        ) {

            unitText +=
                " · " +
                metric.key_value;
        }


        unit.textContent =
            unitText;


        item.appendChild(name);

        item.appendChild(unit);


        item.addEventListener(
            "click",
            () => {

                selectMetric(metric);

            }
        );


        metricResults.appendChild(
            item
        );

    });

}


// ============================================================
// SELECT METRIC
// ============================================================

async function selectMetric(metric) {

    selectedMetric =
        metric;

    searchInput.value =
        metric.variable_name;

    metricResults.innerHTML =
        "";


    metricTitle.textContent =
        metric.variable_name;


    metricUnit.textContent =
        metric.display_unit
        ? "Unit: " + metric.display_unit
        : "Unit: not specified";


    selectedMetricPanel
        .classList
        .remove("hidden");


    message.textContent =
        "Loading...";


    const climate =
        climateSelect.value;


    const folder =
        climateFolders[
            climate
        ];


    const url =
        DATA_ROOT
        + folder
        + "/"
        + metric.id
        + ".json";


    try {

        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                "Metric data unavailable."
            );
        }


        const data =
            await response.json();


        simulationCount.textContent =
            data.simulation_count;


        valueCount.textContent =
            data.value_count;


        drawBoxPlot(
            data,
            climate
        );


    } catch (error) {

        message.textContent =
            "No data available for this metric in "
            + climate
            + ".";

        console.error(error);
    }

}


// ============================================================
// BOX PLOT
// ============================================================

function drawBoxPlot(
    data,
    climate
) {

    const values =
        data.values
            .map(item =>
                Number(item.value)
            )
            .filter(value =>
                Number.isFinite(value)
            );


    if (!values.length) {

        message.textContent =
            "No numerical values are available.";

        return;
    }


    message.textContent =
        "";


    // --------------------------------------------------------
    // Individual points
    // --------------------------------------------------------

    const pointText =
        data.values.map(
            item =>
                item.location
                + "<br>"
                + Number(
                    item.value
                ).toLocaleString(
                    undefined,
                    {
                        maximumFractionDigits: 3
                    }
                )
                + " "
                + (
                    data.metric.display_unit
                    || ""
                )
        );


    const boxTrace = {

        type: "box",

        y: values,

        name: climate,

        boxpoints: false,

        hovertemplate:
            "<b>%{y}</b><extra></extra>",

        marker: {
            size: 5
        }
    };


    const pointTrace = {

        type: "scatter",

        mode: "markers",

        x:
            Array(
                data.values.length
            ).fill(climate),

        y: values,

        text: pointText,

        hovertemplate:
            "%{text}<extra></extra>",

        marker: {
            size: 5
        }
    };


    const layout = {

        title: {
            text:
                data.metric.variable_name
        },

        yaxis: {

            title:
                data.metric.display_unit
                || "Value",

            zeroline: false
        },

        xaxis: {

            title:
                "Climate Zone"
        },

        hovermode:
            "closest",

        margin: {
            l: 80,
            r: 30,
            t: 70,
            b: 70
        },

        paper_bgcolor:
            "white",

        plot_bgcolor:
            "white"
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

            displayModeBar:
                false
        }
    );

}


// ============================================================
// CLIMATE CHANGE
// ============================================================

climateSelect.addEventListener(
    "change",
    () => {

        if (selectedMetric) {

            selectMetric(
                selectedMetric
            );
        }

    }
);


// ============================================================
// SEARCH
// ============================================================

searchInput.addEventListener(
    "input",
    searchMetrics
);


// ============================================================
// INITIALIZE
// ============================================================

loadCatalog();