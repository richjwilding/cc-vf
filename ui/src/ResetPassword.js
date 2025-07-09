import React, { useState } from "react";
import { Button, Input, Checkbox, Link, Divider } from "@heroui/react";
import { Icon } from "@iconify/react";
import { Logo } from "./logo";
import { useParams } from "react-router-dom";

export default function ResetPasswordPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { id:reset_token } = useParams();

  const toggleVisibility = () => setIsVisible(!isVisible);
  const toggleConfirmVisibility = () => setIsConfirmVisible(!isConfirmVisible);

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

    setErrors(newErrors);
    return isValid;
  };

  const doSignUp = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // 2) Build payload. Your backend /auth/register expects { email, password, name }.
      const payload = {
        password: formData.password,
      };


      // 3) Call your backend
      const response = await fetch(`/auth/reset/${reset_token}`, {
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
      console.log("Update succeeded:", data.user);

      setTimeout(() => {
        setFormData({
          password: "",
          confirmPassword: "",
        });
        setIsSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Error calling /auth/reset:", err);
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

          <Button color="primary" type="submit" isLoading={isLoading} isDisabled={isLoading || isSuccess}>
            {isLoading ? "Updating..." : "Update"}
          </Button>
        </form>
        <div className="flex items-center gap-4 py-2">
          <Divider className="flex-1" />
          <p className="shrink-0 text-tiny text-default-500">OR</p>
          <Divider className="flex-1" />
        </div>
      </div>
    </div>
  );
}