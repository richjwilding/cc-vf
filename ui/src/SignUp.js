import React, { useState } from "react";
import { Button, Input, Checkbox, Link, Divider } from "@heroui/react";
import { Icon } from "@iconify/react";
import { Logo } from "./logo";
import { useNavigate } from "react-router-dom";

export default function SignUpPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: false,
  });
  const [errors, setErrors] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const toggleVisibility = () => setIsVisible(!isVisible);
  const toggleConfirmVisibility = () => setIsConfirmVisible(!isConfirmVisible);
  const navigate = useNavigate()

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validateForm = () => {
    let isValid = true;
    const newErrors = { ...errors };

    // First name validation
    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
      isValid = false;
    } else {
      newErrors.firstName = "";
    }

    // Last name validation
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
      isValid = false;
    } else {
      newErrors.lastName = "";
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
      isValid = false;
    } else {
      newErrors.email = "";
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = "Password is required";
      isValid = false;
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
      isValid = false;
    } else {
      newErrors.password = "";
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
      isValid = false;
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
      isValid = false;
    } else {
      newErrors.confirmPassword = "";
    }

    // Terms agreement validation
    if (!formData.agreeToTerms) {
      newErrors.agreeToTerms = "You must agree to the Terms and Privacy Policy";
      isValid = false;
    } else {
      newErrors.agreeToTerms = "";
    }

    setErrors(newErrors);
    return isValid;
  };

  const doSignUp = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // 2) Build payload. Your backend /auth/register expects { email, password, name }.
      const payload = {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
      };

      // 3) Call your backend
      const response = await fetch("/auth/register", {
        method: "POST",
        credentials: "include", // so that the session cookie is set
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // If your backend returned a 400 with { error: "Email already in use" }, display it
        const errMsg = data.error || "Registration failed.";
        setErrors((prev) => ({ ...prev, global: errMsg }));
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      console.log("Registration succeeded:", data.user);

      setTimeout(() => {
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          confirmPassword: "",
          agreeToTerms: false,
        });
        setIsSuccess(false);
        navigate(`/`)
      }, 2000);
    } catch (err) {
      console.error("Error calling /auth/register:", err);
      setErrors((prev) => ({
        ...prev,
        global: "An unexpected error occurred. Please try again.",
      }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[48rem] w-full items-center justify-center bg-gradient-to-br from-lime-50 via-emerald-300 via-70% to-sky-600 p-2 sm:p-4 lg:p-8">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-large bg-content1 px-8 pb-10 pt-6 shadow-small">
        <div className="flex items-center pt-2 pb-2">
          <Logo className='w-8 h-8 shrink-0 mr-1'/>
          <p className="font-['Poppins'] font-black font-family-[Poppins] text-2xl">SENSE</p>
        </div>
        {isSuccess && (
          <div className="mb-2 rounded-medium bg-success-100 p-3 text-sm text-success-700">
            Account created successfully! Redirecting...
          </div>
        )}
        <form
            noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            console.log("onSubmit")
            e.preventDefault();
            doSignUp();
          }}
        >
          <div className="flex gap-2">
            <Input
              isRequired
              label="First Name"
              name="firstName"
              placeholder="First name"
              type="text"
              variant="bordered"
              value={formData.firstName}
              onChange={handleChange}
              isInvalid={!!errors.firstName}
              errorMessage={errors.firstName}
            />
            <Input
              isRequired
              label="Last Name"
              name="lastName"
              placeholder="Last name"
              type="text"
              variant="bordered"
              value={formData.lastName}
              onChange={handleChange}
              isInvalid={!!errors.lastName}
              errorMessage={errors.lastName}
            />
          </div>

          <Input
            isRequired
            label="Email Address"
            name="email"
            placeholder="Enter your email"
            type="email"
            variant="bordered"
            value={formData.email}
            onChange={handleChange}
            isInvalid={!!errors.email}
            errorMessage={errors.email}
          />

          <Input
            isRequired
            endContent={
              <button className="focus:outline-none" type="button" onClick={toggleVisibility}>
                {isVisible ? (
                  <Icon className="pointer-events-none text-2xl text-default-400" icon="lucide:eye-off" />
                ) : (
                  <Icon className="pointer-events-none text-2xl text-default-400" icon="lucide:eye" />
                )}
              </button>
            }
            label="Password"
            name="password"
            placeholder="Enter your password"
            type={isVisible ? "text" : "password"}
            variant="bordered"
            value={formData.password}
            onChange={handleChange}
            isInvalid={!!errors.password}
            errorMessage={errors.password}
          />

          <Input
            isRequired
            endContent={
              <button className="focus:outline-none" type="button" onClick={toggleConfirmVisibility}>
                {isConfirmVisible ? (
                  <Icon className="pointer-events-none text-2xl text-default-400" icon="lucide:eye-off" />
                ) : (
                  <Icon className="pointer-events-none text-2xl text-default-400" icon="lucide:eye" />
                )}
              </button>
            }
            label="Confirm Password"
            name="confirmPassword"
            placeholder="Confirm your password"
            type={isConfirmVisible ? "text" : "password"}
            variant="bordered"
            value={formData.confirmPassword}
            onChange={handleChange}
            isInvalid={!!errors.confirmPassword}
            errorMessage={errors.confirmPassword}
          />

          <div className="py-4">
            <Checkbox
              isRequired
              size="sm"
              name="agreeToTerms"
              isSelected={formData.agreeToTerms}
              onValueChange={(checked) => {
                setFormData((prev) => ({ ...prev, agreeToTerms: checked }));
                if (checked) {
                  setErrors((prev) => ({ ...prev, agreeToTerms: "" }));
                }
              }}
              isInvalid={!!errors.agreeToTerms}
            >
              I agree with the&nbsp;
              <Link className="relative z-[1]" href="#" size="sm">
                Terms
              </Link>
              &nbsp; and&nbsp;
              <Link className="relative z-[1]" href="#" size="sm">
                Privacy Policy
              </Link>
            </Checkbox>
            {errors.agreeToTerms && (
              <p className="mt-1 text-tiny text-danger">{errors.agreeToTerms}</p>
            )}
          </div>
          <Button color="primary" type="submit" isLoading={isLoading} isDisabled={isLoading || isSuccess}>
            {isLoading ? "Signing Up..." : "Sign Up"}
          </Button>
        </form>
        <div className="flex items-center gap-4 py-2">
          <Divider className="flex-1" />
          <p className="shrink-0 text-tiny text-default-500">OR</p>
          <Divider className="flex-1" />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            startContent={<Icon icon="flat-color-icons:google" width={20} />}
            variant="bordered"
            onPress={() => console.log("Google sign up clicked")}
            isDisabled={isLoading || isSuccess}
          >
            Continue with Google
          </Button>
        </div>
        <p className="text-center text-small">
          Already have an account?&nbsp;
          <Link href="/signin" size="sm">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}