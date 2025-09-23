document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#registerForm');
  const firstNameInput = form.querySelector('input[name="name"]');
  const emailInput = form.querySelector('input[name="email"]');
  const phoneInput = form.querySelector('input[name="phone"]');
  const passwordInput = form.querySelector('input[name="password"]');
  const confirmPassInput = form.querySelector('input[name="confirmPass"]');

  form.addEventListener('submit', (event) => {
    // Remove previous error messages
    const previousErrors = document.querySelectorAll('.client-error');
    previousErrors.forEach(error => error.remove());

    // Reset form input styles
    const inputs = form.querySelectorAll('.form-input');
    inputs.forEach(input => {
      input.classList.remove('error', 'success', 'shake');
    });

    // Hide existing error messages
    const errorMessages = form.querySelectorAll('.error-message');
    errorMessages.forEach(msg => {
      msg.classList.remove('show');
      msg.textContent = '';
    });

    let isValid = true;

    function showError(input, message) {
      isValid = false;
      const errorEl = document.createElement('p');
      errorEl.className = 'client-error';
      errorEl.style.cssText = `
        color: #e53e3e;
        font-size: 12px;
        margin-top: 5px;
        opacity: 0;
        transform: translateY(-5px);
        transition: all 0.3s ease;
      `;
      errorEl.textContent = message;
      
      // Add error styling to input
      input.classList.add('error', 'shake');
      
      // Insert error message after the input
      input.parentNode.appendChild(errorEl);
      
      // Animate error message
      setTimeout(() => {
        errorEl.style.opacity = '1';
        errorEl.style.transform = 'translateY(0)';
      }, 10);
    }

    function showSuccess(input) {
      input.classList.add('success');
      input.classList.remove('error');
    }

    // Validate first name (using 'name' field from your form)
    if (!firstNameInput.value.trim()) {
      showError(firstNameInput, 'First name is required');
    } else if (firstNameInput.value.trim().length < 2) {
      showError(firstNameInput, 'First name must be at least 2 characters');
    } else {
      showSuccess(firstNameInput);
    }

    // Validate email format
    if (!emailInput.value.trim()) {
      showError(emailInput, 'Email is required');
    } else {
      const emailPattern = /^\S+@\S+\.\S+$/;
      if (!emailPattern.test(emailInput.value.trim())) {
        showError(emailInput, 'Invalid email format');
      } else {
        showSuccess(emailInput);
      }
    }

    // Validate phone number (digits only, 10-15 length)
    if (!phoneInput.value.trim()) {
      showError(phoneInput, 'Phone number is required');
    } else {
      const phonePattern = /^\d{10,15}$/;
      const cleanedPhone = phoneInput.value.replace(/\D/g, ''); // Remove non-digits
      if (!phonePattern.test(cleanedPhone)) {
        showError(phoneInput, 'Phone number must be 10 to 15 digits');
      } else {
        showSuccess(phoneInput);
      }
    }

    // Validate password length and special character
    if (!passwordInput.value) {
      showError(passwordInput, 'Password is required');
    } else if (passwordInput.value.length < 6) {
      showError(passwordInput, 'Password must be at least 6 characters');
    } else {
      const specialCharPattern = /[!@#$%^&*(),.?":{}|<>]/;
      if (!specialCharPattern.test(passwordInput.value)) {
        showError(passwordInput, 'Password must include at least one special character');
      } else {
        showSuccess(passwordInput);
      }
    }

    // Confirm password match
    if (!confirmPassInput.value) {
      showError(confirmPassInput, 'Please confirm your password');
    } else if (confirmPassInput.value !== passwordInput.value) {
      showError(confirmPassInput, 'Passwords do not match');
    } else {
      showSuccess(confirmPassInput);
    }

    // Prevent form submission if validation fails
    if (!isValid) {
      event.preventDefault();
      
      // Remove shake animation after it completes
      setTimeout(() => {
        inputs.forEach(input => input.classList.remove('shake'));
      }, 500);
    } else {
      // Show loading state if validation passes
      const registerBtn = form.querySelector('.register-button');
      const originalText = registerBtn.innerHTML;
      registerBtn.innerHTML = '<div class="loading-spinner"></div> Creating Account...';
      registerBtn.disabled = true;
      
      // Restore button state after timeout (in case of server error)
      setTimeout(() => {
        if (registerBtn.disabled) {
          registerBtn.innerHTML = originalText;
          registerBtn.disabled = false;
        }
      }, 10000);
    }
  });

  // Real-time validation helpers
  function setupRealTimeValidation() {
    // First name real-time validation
    firstNameInput.addEventListener('blur', () => {
      validateField(firstNameInput, 'firstName');
    });

    // Email real-time validation
    emailInput.addEventListener('blur', () => {
      validateField(emailInput, 'email');
    });

    // Phone real-time validation
    phoneInput.addEventListener('blur', () => {
      validateField(phoneInput, 'phone');
    });

    // Password real-time validation
    passwordInput.addEventListener('input', () => {
      checkPasswordStrength(passwordInput.value);
    });

    passwordInput.addEventListener('blur', () => {
      validateField(passwordInput, 'password');
    });

    // Confirm password real-time validation
    confirmPassInput.addEventListener('input', () => {
      validatePasswordMatch();
    });

    confirmPassInput.addEventListener('blur', () => {
      validateField(confirmPassInput, 'confirmPassword');
    });
  }

  function validateField(input, fieldType) {
    const value = input.value.trim();
    let isValid = true;
    let message = '';

    switch (fieldType) {
      case 'firstName':
        if (!value) {
          isValid = false;
          message = 'First name is required';
        } else if (value.length < 2) {
          isValid = false;
          message = 'First name must be at least 2 characters';
        }
        break;

      case 'email':
        if (!value) {
          isValid = false;
          message = 'Email is required';
        } else if (!/^\S+@\S+\.\S+$/.test(value)) {
          isValid = false;
          message = 'Invalid email format';
        }
        break;

      case 'phone':
        const cleanedPhone = input.value.replace(/\D/g, '');
        if (!value) {
          isValid = false;
          message = 'Phone number is required';
        } else if (!/^\d{10,15}$/.test(cleanedPhone)) {
          isValid = false;
          message = 'Phone number must be 10 to 15 digits';
        }
        break;

      case 'password':
        if (!input.value) {
          isValid = false;
          message = 'Password is required';
        } else if (input.value.length < 6) {
          isValid = false;
          message = 'Password must be at least 6 characters';
        } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(input.value)) {
          isValid = false;
          message = 'Password must include at least one special character';
        }
        break;

      case 'confirmPassword':
        if (!input.value) {
          isValid = false;
          message = 'Please confirm your password';
        } else if (input.value !== passwordInput.value) {
          isValid = false;
          message = 'Passwords do not match';
        }
        break;
    }

    // Update field appearance
    if (isValid) {
      input.classList.remove('error');
      input.classList.add('success');
    } else {
      input.classList.remove('success');
      input.classList.add('error');
    }

    return isValid;
  }

  function checkPasswordStrength(password) {
    const strengthIndicator = document.getElementById('passwordStrength');
    if (!strengthIndicator) return;

    let strength = 0;
    let feedback = '';

    if (password.length >= 6) strength++;
    if (password.match(/[a-z]/)) strength++;
    if (password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[!@#$%^&*(),.?":{}|<>]/)) strength++;

    switch (strength) {
      case 0:
      case 1:
        feedback = 'Weak password';
        strengthIndicator.className = 'password-strength strength-weak';
        break;
      case 2:
      case 3:
        feedback = 'Medium strength';
        strengthIndicator.className = 'password-strength strength-medium';
        break;
      case 4:
      case 5:
        feedback = 'Strong password';
        strengthIndicator.className = 'password-strength strength-strong';
        break;
    }

    strengthIndicator.textContent = password.length > 0 ? feedback : '';
  }

  function validatePasswordMatch() {
    const password = passwordInput.value;
    const confirmPassword = confirmPassInput.value;
    const confirmPasswordError = document.getElementById('confirmPasswordError');

    if (confirmPassword.length > 0) {
      if (password !== confirmPassword) {
        confirmPasswordError.textContent = 'Passwords do not match';
        confirmPasswordError.classList.add('show');
        confirmPassInput.classList.add('error');
        confirmPassInput.classList.remove('success');
      } else {
        confirmPasswordError.textContent = '';
        confirmPasswordError.classList.remove('show');
        confirmPassInput.classList.remove('error');
        confirmPassInput.classList.add('success');
      }
    } else {
      confirmPasswordError.classList.remove('show');
      confirmPassInput.classList.remove('error', 'success');
    }
  }

  // Initialize real-time validation
  setupRealTimeValidation();

  // Remove shake animation after it completes
  document.addEventListener('animationend', function(e) {
    if (e.animationName === 'shake') {
      e.target.classList.remove('shake');
    }
  });

  // Phone number formatting (optional)
  phoneInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 6) {
      value = value.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    } else if (value.length >= 3) {
      value = value.replace(/(\d{3})(\d{0,3})/, '$1-$2');
    }
    e.target.value = value;
  });
});

// Global functions for EJS template usage
window.showError = function(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorDiv = document.getElementById(fieldId + 'Error');
  
  if (input && errorDiv) {
    input.classList.add('error', 'shake');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
  }
};

window.showSuccess = function(fieldId) {
  const input = document.getElementById(fieldId);
  if (input) {
    input.classList.add('success');
    input.classList.remove('error');
  }
};
