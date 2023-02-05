const canvas = document.getElementById("jsCanvas");
const ctx = canvas.getContext("2d");
ctx.globalAlpha = 1;
const colors = document.getElementsByClassName("jsColor");
const range = document.getElementById("jsRange");
const cleaner = document.querySelector(".cleaner");
const eraser = document.querySelector(".eraser");

const INITIAL_COLOR = "#2c2c2c";
const CANVAS_SIZE = 700;
let MODE = "drawing";
const ERASER_SIZE = 15;

canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

ctx.fillStyle = "white";
ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
ctx.strokeStyle = INITIAL_COLOR;
ctx.fillStyle = INITIAL_COLOR;
ctx.lineWidth = 2.5;

let painting = false;

function stopPainting() {
  painting = false;
}

function startPainting() {
  painting = true;
}

function onMouseMove(event) {
  const x = event.offsetX;
  const y = event.offsetY;
  if (MODE === "drawing") {
    if (!painting) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      //console.log("lingTo : ", x, y);
      ctx.stroke();
    }
  } else if (MODE === "erase") {
    if (painting) {
      ctx.clearRect(
        x - ERASER_SIZE / 2,
        y - ERASER_SIZE / 2,
        ERASER_SIZE,
        ERASER_SIZE
      );
    }
  }
}

function handleColorClick(event) {
  MODE = "drawing";
  const color = event.target.style.backgroundColor;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
}

function handleRangeChange(event) {
  const size = event.target.value;
  ctx.lineWidth = size;
}

function handleCanvasClick() {}

function handleCM(event) {
  event.preventDefault();
}

function clean() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function erase() {
  MODE = "erase";
}

if (canvas) {
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", startPainting);
  canvas.addEventListener("mouseup", stopPainting);
  canvas.addEventListener("mouseleave", stopPainting);
  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("contextmenu", handleCM);
}

Array.from(colors).forEach((color) =>
  color.addEventListener("click", handleColorClick)
);

cleaner.addEventListener("click", clean);

eraser.addEventListener("click", erase);

if (range) {
  range.addEventListener("input", handleRangeChange);
}
