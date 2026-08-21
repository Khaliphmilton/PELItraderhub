document.addEventListener("DOMContentLoaded", () => {

  console.log("PELItradershub loaded");

  const buttons = document.querySelectorAll(".button");

  buttons.forEach(button => {

    button.addEventListener("click", () => {

      console.log(
        "PELItradershub navigation:",
        button.textContent.trim()
      );

    });

  });

});
